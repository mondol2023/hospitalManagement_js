'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, DEFAULT_PASSWORD } = require('../helpers/factories');
const { User, Organization, Branch, Staff } = require('../../src/models');
const tokenService = require('../../src/services/tokenService');
const profileService = require('../../src/services/profileService');
const organizationStatus = require('../../src/services/organizationStatus');
const context = require('../../src/utils/context');
const { ROLES } = require('../../src/utils/constants');

// async so a returned Query executes inside the bypass scope
const unscoped = (fn) => context.withoutTenant('test:platform', async () => fn());

async function platformHeaders() {
  const user = await unscoped(() =>
    User.create({
      name: 'Platform Admin',
      email: `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@hms.test`,
      password: DEFAULT_PASSWORD,
      role: ROLES.PLATFORM_ADMIN,
    })
  );
  const { accessToken } = tokenService.issueTokens(user);
  return { Authorization: `Bearer ${accessToken}` };
}

let seq = 0;
const orgBody = (overrides = {}) => {
  seq += 1;
  return {
    name: `Hospital ${seq}`,
    code: `PH${seq}${Date.now().toString(36).slice(-3)}`.toUpperCase().slice(0, 8),
    admin: { name: 'First Admin', email: `admin${seq}-${Date.now().toString(36)}@new.test`, password: DEFAULT_PASSWORD },
    ...overrides,
  };
};

describe('platform — organisations', () => {
  it('creates an organisation with head office, default registration branch and first admin atomically', async () => {
    const headers = await platformHeaders();
    const body = orgBody({ subdomain: `pl${Date.now().toString(36)}` });
    const res = await api().post(url('/platform/organizations')).set(headers).send(body);
    expectOk(res, 201);

    const { organization, branch, admin } = res.body.data;
    expect(branch).toMatchObject({ code: 'HO', name: 'Head Office', isHeadOffice: true });
    expect(admin.role).toBe(ROLES.ADMIN);
    expect(admin).not.toHaveProperty('password');

    const stored = await unscoped(() => Organization.findById(organization.id).lean());
    expect(String(stored.defaultRegistrationBranch)).toBe(String(branch.id));

    const user = await unscoped(() => User.findById(admin.id).lean());
    expect(String(user.organization)).toBe(String(organization.id));
    expect(user.branches.map(String)).toEqual([String(branch.id)]);
    expect(String(user.defaultBranch)).toBe(String(branch.id));
    expect(await unscoped(() => Staff.countDocuments({ user: admin.id }))).toBe(1);
  });

  it('the new admin can log in and reach their own organisation', async () => {
    const headers = await platformHeaders();
    const body = orgBody();
    await api().post(url('/platform/organizations')).set(headers).send(body).expect(201);

    const login = await api()
      .post(url('/auth/login'))
      .send({ email: body.admin.email, password: body.admin.password, organizationCode: body.code });
    expectOk(login);
    const me = await api()
      .get(url('/organization'))
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expectOk(me);
    expect(me.body.data.code).toBe(body.code);
  });

  it('a failure creating the admin rolls back the organisation and branch', async () => {
    const headers = await platformHeaders();
    const body = orgBody();
    const spy = jest.spyOn(profileService, 'createProfile').mockRejectedValueOnce(new Error('boom'));
    try {
      const res = await api().post(url('/platform/organizations')).set(headers).send(body);
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    expect(await unscoped(() => Organization.countDocuments({ code: body.code }))).toBe(0);
    expect(await unscoped(() => Branch.countDocuments({ code: 'HO', name: 'Head Office' }))).toBe(0);
    expect(await unscoped(() => User.countDocuments({ email: body.admin.email }))).toBe(0);
  });

  it('duplicate code and duplicate subdomain are 409', async () => {
    const headers = await platformHeaders();
    const sub = `dup${Date.now().toString(36)}`;
    const first = orgBody({ subdomain: sub });
    await api().post(url('/platform/organizations')).set(headers).send(first).expect(201);

    const sameCode = orgBody({ code: first.code });
    expectError(await api().post(url('/platform/organizations')).set(headers).send(sameCode), 409);

    const sameSub = orgBody({ subdomain: sub });
    expectError(await api().post(url('/platform/organizations')).set(headers).send(sameSub), 409);
  });

  it('rejects a reserved subdomain and a weak admin password', async () => {
    const headers = await platformHeaders();
    const reserved = await api()
      .post(url('/platform/organizations'))
      .set(headers)
      .send(orgBody({ subdomain: 'admin' }));
    expect(reserved.status).toBeGreaterThanOrEqual(400);
    expect(reserved.status).toBeLessThan(500);

    const weak = orgBody();
    weak.admin.password = 'short';
    expectError(await api().post(url('/platform/organizations')).set(headers).send(weak), 422);
  });

  it('lists organisations, paginated', async () => {
    const headers = await platformHeaders();
    await api().post(url('/platform/organizations')).set(headers).send(orgBody()).expect(201);
    const res = await api().get(url('/platform/organizations')).query({ limit: 1 }).set(headers);
    expectOk(res);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBeGreaterThanOrEqual(2); // test tenant + new one
  });

  it('suspending an organisation makes its users get 403 on their next request', async () => {
    const headers = await platformHeaders();
    const created = await api().post(url('/platform/organizations')).set(headers).send(orgBody());
    const { organization, admin } = created.body.data;

    const adminUser = await unscoped(() => User.findById(admin.id));
    const { accessToken } = tokenService.issueTokens(adminUser);
    const asAdmin = { Authorization: `Bearer ${accessToken}` };
    expectOk(await api().get(url('/organization')).set(asAdmin)); // primes the status cache

    const patch = await api()
      .patch(url(`/platform/organizations/${organization.id}`))
      .set(headers)
      .send({ status: 'suspended' });
    expectOk(patch);
    expect(patch.body.data.status).toBe('suspended');

    expectError(await api().get(url('/organization')).set(asAdmin), 403, 'ORGANIZATION_SUSPENDED');
    organizationStatus.clear(organization.id);
  });

  it('PATCH changes only status, plan and subdomain', async () => {
    const headers = await platformHeaders();
    const created = await api().post(url('/platform/organizations')).set(headers).send(orgBody());
    const { organization } = created.body.data;

    const res = await api()
      .patch(url(`/platform/organizations/${organization.id}`))
      .set(headers)
      .send({ plan: 'enterprise', code: 'HACKED', name: 'Renamed' });
    expectOk(res);
    expect(res.body.data).toMatchObject({ plan: 'enterprise', code: organization.code, name: organization.name });
  });
});

describe('platform — access boundaries', () => {
  it.each([ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.PATIENT])('%s gets 403 on /platform/*', async (role) => {
    const { headers } = await createActor(role);
    expectError(await api().get(url('/platform/organizations')).set(headers), 403);
    expectError(await api().post(url('/platform/organizations')).set(headers).send({}), 403);
  });

  it('an anonymous caller gets 401', async () => {
    expectError(await api().get(url('/platform/organizations')), 401, 'TOKEN_MISSING');
  });

  it.each(['/patients', '/users', '/branches', '/organization', '/departments', '/appointments', '/beds'])(
    'platform_admin gets 403 on %s',
    async (path) => {
      const headers = await platformHeaders();
      expectError(await api().get(url(path)).set(headers), 403);
    }
  );
});
