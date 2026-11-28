'use strict';

const { api, url, expectOk } = require('../helpers/api');
const { createActor, ensureDepartment } = require('../helpers/factories');
const { makeTenant } = require('../helpers/tenant');
const context = require('../../src/utils/context');
const { Bed } = require('../../src/models');
const { ROLES } = require('../../src/utils/constants');

describe('tenancy — context binding', () => {
  it('an authenticated POST with a JSON body reaches the plugin with the right tenant', async () => {
    const tenant = await makeTenant();
    const { headers } = await createActor(ROLES.ADMIN, { tenant });
    await ensureDepartment('ICU', { tenant });
    const res = await api()
      .post(url('/beds'))
      .set(headers)
      .send({ bedNumber: 'CB-1', ward: 'ICU' });
    expectOk(res, 201);

    const stored = await context.withoutTenant('test:read', () => Bed.findOne({ bedNumber: 'CB-1' }).lean().exec());
    expect(String(stored.organization)).toBe(String(tenant.organization._id));
    expect(String(stored.branch)).toBe(String(tenant.branch._id));
  });

  it('interleaved requests from two tenants each see only their own data', async () => {
    const [a, b] = [await makeTenant(), await makeTenant()];
    const [adminA, adminB] = [
      await createActor(ROLES.ADMIN, { tenant: a }),
      await createActor(ROLES.ADMIN, { tenant: b }),
    ];
    await ensureDepartment('W', { tenant: a });
    await ensureDepartment('W', { tenant: b });
    await api().post(url('/beds')).set(adminA.headers).send({ bedNumber: 'A-1', ward: 'W' });
    await api().post(url('/beds')).set(adminB.headers).send({ bedNumber: 'B-1', ward: 'W' });

    const calls = Array.from({ length: 20 }, (_, i) => {
      const actor = i % 2 ? adminB : adminA;
      return api().get(url('/beds')).set(actor.headers).then((res) => ({ i, res }));
    });
    for (const { i, res } of await Promise.all(calls)) {
      expectOk(res);
      const numbers = JSON.stringify(res.body);
      expect(numbers).toContain(i % 2 ? 'B-1' : 'A-1');
      expect(numbers).not.toContain(i % 2 ? 'A-1' : 'B-1');
    }
  });
});
