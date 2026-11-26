'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { ROLES } = require('../../src/utils/constants');

/**
 * Pay is set through the admin-only employment route and must never come back
 * from a read. Every staff-facing read is checked here, because the leak was in
 * the repository defaults, not in any one endpoint.
 */
describe('staff — salary stays private', () => {
  it('omits salaryCents from every item of the staff directory', async () => {
    const reader = await createActor(ROLES.RECEPTIONIST, { profile: { salaryCents: 450000 } });
    await createActor(ROLES.PHARMACIST, { profile: { salaryCents: 520000 } });

    const res = await api().get(url('/staff')).set(reader.headers);
    const items = res.body.data;

    expectOk(res);
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const item of items) expect(item).not.toHaveProperty('salaryCents');
  });

  it('omits salaryCents when looking a profile up by user id', async () => {
    const reader = await createActor(ROLES.RECEPTIONIST);
    const target = await createActor(ROLES.ACCOUNTANT, { profile: { salaryCents: 610000 } });

    const res = await api().get(url(`/staff/by-user/${target.user.id}`)).set(reader.headers);
    const profile = expectOk(res);

    expect(profile.employeeId).toBe(target.profile.employeeId);
    expect(profile).not.toHaveProperty('salaryCents');
  });

  it('still lets an administrator set salaryCents, and returns what was set', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const target = await createActor(ROLES.PHARMACIST);

    const res = await api()
      .patch(url(`/staff/${target.profile.id}/employment`))
      .set(admin.headers)
      .send({ salaryCents: 530000 });
    const updated = expectOk(res);

    expect(updated.salaryCents).toBe(530000);
  });
});
