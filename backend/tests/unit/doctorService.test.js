'use strict';

const { DoctorService } = require('../../src/services/doctorService');
const { CacheService } = require('../../src/services/cacheService');
const { ROLES } = require('../../src/utils/constants');
const context = require('../../src/utils/context');

/**
 * The doctor directory is cached, and Redis is off in the integration suite, so
 * cache behaviour can only be proved here: a real `CacheService` over an
 * in-memory stand-in for the Redis client, and a `DoctorService` over a stub
 * repository that answers differently for the public and the administrator query.
 */

/** Just enough of an ioredis client for get / set / scan / unlink. */
function fakeRedis() {
  const store = new Map();
  return {
    status: 'ready',
    get: async (key) => (store.has(key) ? store.get(key) : null),
    set: async (key, value) => {
      store.set(key, value);
      return 'OK';
    },
    scan: async (_cursor, _match, pattern) => {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', [...store.keys()].filter((key) => key.startsWith(prefix))];
    },
    unlink: async (...keys) => keys.filter((key) => store.delete(key)).length,
  };
}

const PUBLIC_PAGE = { items: [{ id: 'open' }] };
const ADMIN_PAGE = { items: [{ id: 'open' }, { id: 'closed' }] };

const build = () => {
  const doctors = {
    searchFilter: jest.fn(() => ({})),
    listAvailable: jest.fn(async () => PUBLIC_PAGE),
    listForAdmin: jest.fn(async () => ADMIN_PAGE),
  };
  const service = new DoctorService({
    doctors,
    appointments: {},
    cache: new CacheService(fakeRedis()),
  });
  // Cache keys are tenant-prefixed, so a read only works inside a tenant context.
  const list = service.list.bind(service);
  service.list = (...args) => context.run({ organizationId: 'org-test' }, () => list(...args));
  return { service, doctors };
};

const admin = { id: 'a1', role: ROLES.ADMIN };
const patient = { id: 'p1', role: ROLES.PATIENT };

describe('DoctorService.list — cache scope', () => {
  it("does not hand an administrator's status=all page to a patient with the same query", async () => {
    const { service, doctors } = build();
    const query = { status: 'all', specialization: 'cardiology' };

    await expect(service.list(query, admin)).resolves.toBe(ADMIN_PAGE);
    // JSON round-trips through the fake Redis, so compare by value, not identity.
    await expect(service.list(query, patient)).resolves.toEqual(PUBLIC_PAGE);

    expect(doctors.listAvailable).toHaveBeenCalledTimes(1);
  });

  it("does not hand a patient's directory to an administrator who asks for status=all", async () => {
    const { service, doctors } = build();
    const query = { status: 'all', specialization: 'cardiology' };

    await expect(service.list(query, patient)).resolves.toEqual(PUBLIC_PAGE);
    await expect(service.list(query, admin)).resolves.toEqual(ADMIN_PAGE);

    expect(doctors.listForAdmin).toHaveBeenCalledTimes(1);
  });

  it('keeps separate pages for different status and accepting values', async () => {
    const { service, doctors } = build();

    await service.list({ status: 'all' }, admin);
    await service.list({ status: 'inactive' }, admin);
    await service.list({ status: 'inactive', accepting: false }, admin);

    expect(doctors.listForAdmin).toHaveBeenCalledTimes(3);
  });

  it('serves the repeat of the same administrator query from the cache', async () => {
    const { service, doctors } = build();

    await service.list({ status: 'all' }, admin);
    await service.list({ status: 'all' }, admin);

    expect(doctors.listForAdmin).toHaveBeenCalledTimes(1);
  });

  it('gives a patient who sends status and accepting the same cached page as one who does not', async () => {
    const { service, doctors } = build();

    await service.list({ specialization: 'cardiology' }, patient);
    await service.list({ specialization: 'cardiology', status: 'all', accepting: false }, patient);

    expect(doctors.listAvailable).toHaveBeenCalledTimes(1);
  });
});

describe('DoctorService.list — filters', () => {
  it('asks the repository for the administrator filters only when the caller is one', async () => {
    const { service, doctors } = build();

    await service.list({ status: 'inactive', accepting: false }, admin);

    expect(doctors.listForAdmin).toHaveBeenCalledWith(
      { isActive: false, isAcceptingPatients: false },
      { status: 'inactive', accepting: false }
    );
  });

  it('does not filter on isActive for status=all, nor on acceptance unless asked', async () => {
    const { service, doctors } = build();

    await service.list({ status: 'all' }, admin);

    expect(doctors.listForAdmin).toHaveBeenCalledWith({}, { status: 'all' });
  });

  it('keeps the directory limited to active, accepting doctors for a patient', async () => {
    const { service, doctors } = build();

    await service.list({ status: 'all', accepting: false }, patient);

    expect(doctors.listForAdmin).not.toHaveBeenCalled();
    expect(doctors.listAvailable).toHaveBeenCalledWith({}, { status: 'all', accepting: false });
  });
});
