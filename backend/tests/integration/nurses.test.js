'use strict';

const { api, url, expectOk } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { ROLES } = require('../../src/utils/constants');

/**
 * Who is on the floor for a ward. The handover form picks its receiver from
 * this list, so a row has to carry a name, not just an id.
 */
describe('nurses — on duty in a ward', () => {
  it('names each on-duty nurse so a handover form can show who it is handing to', async () => {
    const sender = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });
    const onDuty = await createActor(ROLES.NURSE, {
      user: { name: 'Amara Okafor' },
      profile: { assignedWards: ['ICU'], isOnDuty: true },
    });
    await createActor(ROLES.NURSE, {
      user: { name: 'Off Duty Nurse' },
      profile: { assignedWards: ['ICU'], isOnDuty: false },
    });

    const res = await api().get(url('/nurses/ward/ICU/on-duty')).set(sender.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].user).toMatchObject({ name: 'Amara Okafor' });
    expect(String(items[0].user._id || items[0].user.id)).toBe(String(onDuty.user._id));
  });
});

describe('nurses — status filter is for administrators', () => {
  const idOf = (doc) => String(doc._id || doc.id);

  it('lets an administrator list deactivated nurses with status=inactive', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const gone = await createActor(ROLES.NURSE, { profile: { isActive: false } });
    const here = await createActor(ROLES.NURSE);

    const res = await api().get(url('/nurses?status=inactive&limit=100')).set(admin.headers);
    const ids = expectOk(res).map(idOf);

    expect(ids).toContain(String(gone.profile.id));
    expect(ids).not.toContain(String(here.profile.id));
  });

  it('gives a doctor the active list even when they ask for inactive', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const gone = await createActor(ROLES.NURSE, { profile: { isActive: false } });
    const here = await createActor(ROLES.NURSE);

    const res = await api().get(url('/nurses?status=inactive&limit=100')).set(doctor.headers);
    const ids = expectOk(res).map(idOf);

    expect(ids).toContain(String(here.profile.id));
    expect(ids).not.toContain(String(gone.profile.id));
  });
});
