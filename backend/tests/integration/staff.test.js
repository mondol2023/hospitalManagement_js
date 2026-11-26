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

/**
 * The roster page needs people who have left, so an administrator can ask for
 * them. Everyone else keeps seeing active staff only, and is not told the
 * parameter exists.
 */
describe('staff — status filter is for administrators', () => {
  const idOf = (doc) => String(doc._id || doc.id);

  it('lets an administrator include deactivated staff with status=all', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const gone = await createActor(ROLES.RECEPTIONIST, { profile: { isActive: false } });

    const res = await api().get(url('/staff?status=all&limit=100')).set(admin.headers);

    expect(expectOk(res).map(idOf)).toContain(String(gone.profile.id));
  });

  it('lets an administrator list only deactivated staff with status=inactive', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const gone = await createActor(ROLES.RECEPTIONIST, { profile: { isActive: false } });
    const here = await createActor(ROLES.RECEPTIONIST);

    const res = await api().get(url('/staff?status=inactive&limit=100')).set(admin.headers);
    const ids = expectOk(res).map(idOf);

    expect(ids).toContain(String(gone.profile.id));
    expect(ids).not.toContain(String(here.profile.id));
  });

  it('defaults an administrator to active staff', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const gone = await createActor(ROLES.RECEPTIONIST, { profile: { isActive: false } });

    const res = await api().get(url('/staff?limit=100')).set(admin.headers);

    expect(expectOk(res).map(idOf)).not.toContain(String(gone.profile.id));
  });

  it('ignores status=all for a non-administrator', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const gone = await createActor(ROLES.PHARMACIST, { profile: { isActive: false } });

    const res = await api().get(url('/staff?status=all&limit=100')).set(receptionist.headers);

    expect(expectOk(res).map(idOf)).not.toContain(String(gone.profile.id));
  });

  it('rejects a status value outside active, inactive and all', async () => {
    const admin = await createActor(ROLES.ADMIN);

    expectError(await api().get(url('/staff?status=banana')).set(admin.headers), 422);
  });
});

describe('staff — role filter only takes roles stored in Staff', () => {
  it.each([ROLES.DOCTOR, ROLES.NURSE, ROLES.PATIENT, 'banana'])(
    'rejects role=%s with 422 instead of returning an empty page',
    async (role) => {
      const admin = await createActor(ROLES.ADMIN);

      expectError(await api().get(url(`/staff?role=${role}`)).set(admin.headers), 422);
    }
  );

  it('still filters by a staff role', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const pharmacist = await createActor(ROLES.PHARMACIST);

    const res = await api().get(url('/staff?role=pharmacist&limit=100')).set(admin.headers);

    const rows = expectOk(res);
    expect(rows.map((row) => String(row.id ?? row._id))).toContain(String(pharmacist.profile.id));
    expect(rows.every((row) => row.role === ROLES.PHARMACIST)).toBe(true);
  });
});
