'use strict';

const mongoose = require('mongoose');
const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { ROLES } = require('../../src/utils/constants');

const idOf = (doc) => String(doc._id || doc.id);

/**
 * Employment fields (department, shift, whether the doctor takes new patients)
 * belong to whoever administers the hospital, not to the doctor. Clinical fields
 * stay on `PATCH /doctors/me`.
 */
describe('doctors — employment set by an administrator', () => {
  it('lets an administrator change department, shift and acceptance', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(admin.headers)
      .send({ department: 'Cardiology', shift: 'night', isAcceptingPatients: false });
    const updated = expectOk(res);

    expect(updated).toMatchObject({
      department: 'Cardiology',
      shift: 'night',
      isAcceptingPatients: false,
    });
    expect(updated.user).toMatchObject({ name: doctor.user.name, email: doctor.user.email });
  });

  it('lets a manager do the same', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(manager.headers)
      .send({ department: 'Neurology' });

    expect(expectOk(res).department).toBe('Neurology');
  });

  it('leaves the fields it was not sent alone', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR, {
      profile: { department: 'Oncology', consultationFeeCents: 5000 },
    });

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(admin.headers)
      .send({ shift: 'evening' });
    const updated = expectOk(res);

    expect(updated.department).toBe('Oncology');
    expect(updated.consultationFeeCents).toBe(5000);
  });

  it('refuses a doctor, even on their own profile', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(doctor.headers)
      .send({ isAcceptingPatients: false });

    expectError(res, 403);
  });

  it('ignores clinical fields it does not own', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR, { profile: { consultationFeeCents: 5000 } });

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(admin.headers)
      .send({ department: 'ENT', consultationFeeCents: 1 });
    const updated = expectOk(res);

    expect(updated.department).toBe('ENT');
    expect(updated.consultationFeeCents).toBe(5000);
  });

  it('rejects an empty patch', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .patch(url(`/doctors/${doctor.profile.id}/employment`))
      .set(admin.headers)
      .send({});

    expectError(res, 422);
  });

  it('returns 404 for a doctor that does not exist', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const res = await api()
      .patch(url(`/doctors/${new mongoose.Types.ObjectId()}/employment`))
      .set(admin.headers)
      .send({ department: 'ENT' });

    // The message, not just the status: a missing route is also a 404.
    expect(expectError(res, 404).message).toBe('Doctor not found');
  });

  it('drops a doctor from the patient directory once they stop accepting patients', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'dermatology_g1' },
    });
    const listUrl = url('/doctors?specialization=dermatology_g1');

    // Prime the cache: the directory is cached, so a stale entry is the failure to catch.
    const before = expectOk(await api().get(listUrl).set(patient.headers));
    expect(before.map(idOf)).toContain(String(doctor.profile.id));

    expectOk(
      await api()
        .patch(url(`/doctors/${doctor.profile.id}/employment`))
        .set(admin.headers)
        .send({ isAcceptingPatients: false })
    );

    const after = expectOk(await api().get(listUrl).set(patient.headers));
    expect(after.map(idOf)).not.toContain(String(doctor.profile.id));
  });
});

/**
 * The roster page lists every doctor, including those who are inactive or have
 * closed their books. The patient directory must never show them, and because
 * the directory is cached, an administrator's wider page must not be served to a
 * patient who sends the same query string (or the other way round).
 */
describe('doctors — directory filters are for administrators', () => {
  it('lists a doctor who is not accepting patients for an administrator with status=all', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'rheum_g2a', isAcceptingPatients: false },
    });

    const res = await api()
      .get(url('/doctors?status=all&specialization=rheum_g2a'))
      .set(admin.headers);

    expect(expectOk(res).map(idOf)).toContain(String(doctor.profile.id));
  });

  it('filters by accepting for an administrator', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const open = await createActor(ROLES.DOCTOR, { profile: { specialization: 'rheum_g2b' } });
    const closed = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'rheum_g2b', isAcceptingPatients: false },
    });

    const res = await api()
      .get(url('/doctors?status=all&accepting=false&specialization=rheum_g2b'))
      .set(admin.headers);
    const ids = expectOk(res).map(idOf);

    expect(ids).toContain(String(closed.profile.id));
    expect(ids).not.toContain(String(open.profile.id));
  });

  it('lists inactive doctors only with status=inactive', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const gone = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'rheum_g2c', isActive: false },
    });
    const here = await createActor(ROLES.DOCTOR, { profile: { specialization: 'rheum_g2c' } });

    const res = await api()
      .get(url('/doctors?status=inactive&specialization=rheum_g2c'))
      .set(admin.headers);
    const ids = expectOk(res).map(idOf);

    expect(ids).toContain(String(gone.profile.id));
    expect(ids).not.toContain(String(here.profile.id));
  });

  it("does not serve an administrator's status=all page to a patient with the same query", async () => {
    const admin = await createActor(ROLES.ADMIN);
    const patient = await createActor(ROLES.PATIENT);
    const closed = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'rheum_g2d', isAcceptingPatients: false },
    });
    const query = url('/doctors?status=all&specialization=rheum_g2d');

    // Redis is off in this suite, so this checks the filtering; the cache key is covered in unit/doctorService.test.js.
    expect(expectOk(await api().get(query).set(admin.headers)).map(idOf)).toContain(
      String(closed.profile.id)
    );
    const asPatient = expectOk(await api().get(query).set(patient.headers));

    expect(asPatient.map(idOf)).not.toContain(String(closed.profile.id));
  });

  it("does not serve a patient's directory to an administrator who asks for status=all", async () => {
    const admin = await createActor(ROLES.ADMIN);
    const patient = await createActor(ROLES.PATIENT);
    const closed = await createActor(ROLES.DOCTOR, {
      profile: { specialization: 'rheum_g2e', isAcceptingPatients: false },
    });
    const query = url('/doctors?status=all&specialization=rheum_g2e');

    // Patient first, then admin on the same query string. Cache scoping itself: unit/doctorService.test.js.
    expect(expectOk(await api().get(query).set(patient.headers)).map(idOf)).not.toContain(
      String(closed.profile.id)
    );
    const asAdmin = expectOk(await api().get(query).set(admin.headers));

    expect(asAdmin.map(idOf)).toContain(String(closed.profile.id));
  });

  it('shows an administrator the new acceptance state right after it is switched off', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR, { profile: { specialization: 'rheum_g2f' } });
    const query = url('/doctors?status=all&specialization=rheum_g2f');

    expectOk(await api().get(query).set(admin.headers));
    expectOk(
      await api()
        .patch(url(`/doctors/${doctor.profile.id}/employment`))
        .set(admin.headers)
        .send({ isAcceptingPatients: false })
    );
    const after = expectOk(await api().get(query).set(admin.headers));

    expect(after.find((d) => idOf(d) === String(doctor.profile.id))).toMatchObject({
      isAcceptingPatients: false,
    });
  });
});
