'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { Appointment, MedicalRecord } = require('../../src/models');
const { ROLES, APPOINTMENT_STATUS } = require('../../src/utils/constants');
const notificationService = require('../../src/services/notificationService');

/**
 * Medical records for the doctor slice (4b): the follow-up listing (B4, B8), the
 * appointment link on create (B9) and patient names on the records list.
 *
 * Fixtures are written through the models, so each test pins the dates it cares
 * about relative to "now" without going through the create endpoint.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const fromNow = (days) => new Date(Date.now() + days * DAY_MS);
const MISSING_ID = '507f1f77bcf86cd799439011';

beforeEach(() => {
  // Notifications are a side channel; their delivery is not what is tested here.
  jest.spyOn(notificationService, 'notify').mockResolvedValue(null);
});

function recordFor(doctor, patient, overrides = {}) {
  return MedicalRecord.create({
    patient: patient.profile._id,
    doctor: doctor.user._id,
    diagnosis: 'Hypertension',
    visitDate: fromNow(-10),
    ...overrides,
  });
}

const followUps = (actor, query = {}) =>
  api().get(url('/medical-records/follow-ups')).query(query).set(actor.headers);

// --- B4 + B8: who may read the listing ---------------------------------------

describe('GET /medical-records/follow-ups — access', () => {
  it('admits administrators and doctors', async () => {
    for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR]) {
      const actor = await createActor(role);
      expectOk(await followUps(actor));
    }
  });

  it('refuses receptionists and patients at the door', async () => {
    for (const role of [ROLES.RECEPTIONIST, ROLES.PATIENT, ROLES.PHARMACIST]) {
      const actor = await createActor(role);
      expectError(await followUps(actor), 403, 'FORBIDDEN');
    }
  });

  it('refuses a nurse, who has no caseload of their own here (D4)', async () => {
    const nurse = await createActor(ROLES.NURSE);
    expectError(await followUps(nurse), 403, 'FORBIDDEN');
  });

  it('refuses a doctor asking for another doctor’s follow-ups', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const other = await createActor(ROLES.DOCTOR);
    expectError(await followUps(doctor, { doctorId: String(other.user._id) }), 403, 'FORBIDDEN');
    // Naming themselves is fine.
    expectOk(await followUps(doctor, { doctorId: String(doctor.user._id) }));
  });
});

// --- B8: what the listing contains --------------------------------------------

describe('GET /medical-records/follow-ups — upcoming', () => {
  it('lists the doctor’s own follow-ups due in the window, soonest first, populated', async () => {
    const doctor = await createActor(ROLES.DOCTOR, { user: { name: 'Dr Who' } });
    const other = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT, { user: { name: 'Ada Lovelace' } });

    const later = await recordFor(doctor, patient, { followUpDate: fromNow(5), diagnosis: 'Later' });
    const sooner = await recordFor(doctor, patient, { followUpDate: fromNow(2), diagnosis: 'Sooner' });
    await recordFor(doctor, patient, { followUpDate: fromNow(9) }); // outside 7 days
    await recordFor(doctor, patient, { followUpDate: fromNow(-1) }); // past
    await recordFor(other, patient, { followUpDate: fromNow(3) }); // not theirs

    const res = await followUps(doctor);
    const rows = expectOk(res);

    expect(rows.map((r) => r.id)).toEqual([String(sooner._id), String(later._id)]);
    expect(res.body.meta.pagination).toMatchObject({ total: 2 });
    expect(rows[0]).toMatchObject({
      diagnosis: 'Sooner',
      patient: {
        id: String(patient.profile._id),
        medicalRecordNumber: patient.profile.medicalRecordNumber,
        user: { name: 'Ada Lovelace' },
      },
      doctor: { id: String(doctor.user._id), name: 'Dr Who' },
    });
    expect(rows[0].followUpDate).toEqual(expect.any(String));
    expect(rows[0].visitDate).toEqual(expect.any(String));
    // Nothing beyond the row contract leaks into the listing.
    expect(rows[0]).not.toHaveProperty('prescriptions');
    expect(rows[0].doctor).not.toHaveProperty('email');
  });

  it('defaults to seven days and honours `days`', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    await recordFor(doctor, patient, { followUpDate: fromNow(6) });
    await recordFor(doctor, patient, { followUpDate: fromNow(20) });

    expect(expectOk(await followUps(doctor))).toHaveLength(1);
    expect(expectOk(await followUps(doctor, { days: 30 }))).toHaveLength(2);
    expectError(await followUps(doctor, { days: 31 }), 422);
  });

  it('pages the result', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    for (let i = 1; i <= 3; i += 1) {
      await recordFor(doctor, patient, { followUpDate: fromNow(i) });
    }

    const res = await followUps(doctor, { limit: 2, page: 2 });
    expect(expectOk(res)).toHaveLength(1);
    expect(res.body.meta.pagination).toMatchObject({ total: 3, page: 2, limit: 2 });
  });

  it('shows administrators every doctor’s follow-ups, filterable by doctor', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const a = await createActor(ROLES.DOCTOR);
    const b = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    await recordFor(a, patient, { followUpDate: fromNow(1) });
    await recordFor(b, patient, { followUpDate: fromNow(2) });

    expect(expectOk(await followUps(admin))).toHaveLength(2);
    const filtered = expectOk(await followUps(admin, { doctorId: String(b.user._id) }));
    expect(filtered.map((r) => r.doctor.id)).toEqual([String(b.user._id)]);
  });
});

describe('GET /medical-records/follow-ups — overdue', () => {
  it('lists follow-ups missed in the last 30 days, most overdue first', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    // One patient per record: a second visit by the same doctor would count as "came back".
    const [p1, p2, p3] = [await createActor(ROLES.PATIENT), await createActor(ROLES.PATIENT), await createActor(ROLES.PATIENT)];

    const recent = await recordFor(doctor, p1, { visitDate: fromNow(-20), followUpDate: fromNow(-2) });
    const older = await recordFor(doctor, p2, { visitDate: fromNow(-40), followUpDate: fromNow(-25) });
    await recordFor(doctor, p3, { visitDate: fromNow(-60), followUpDate: fromNow(-31) }); // lapsed
    // Upcoming, and a different patient so it does not count as "came back".
    const someoneElse = await createActor(ROLES.PATIENT);
    await recordFor(doctor, someoneElse, { visitDate: fromNow(-3), followUpDate: fromNow(3) });

    const rows = expectOk(await followUps(doctor, { overdue: 'true', days: 1 }));
    expect(rows.map((r) => r.id)).toEqual([String(older._id), String(recent._id)]);
  });

  it('leaves out a patient who has since been seen again by the same doctor', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const colleague = await createActor(ROLES.DOCTOR);
    const cameBack = await createActor(ROLES.PATIENT);
    const seenElsewhere = await createActor(ROLES.PATIENT);

    await recordFor(doctor, cameBack, { visitDate: fromNow(-20), followUpDate: fromNow(-5) });
    await recordFor(doctor, cameBack, { visitDate: fromNow(-4) });

    const stillDue = await recordFor(doctor, seenElsewhere, {
      visitDate: fromNow(-20),
      followUpDate: fromNow(-5),
    });
    await recordFor(colleague, seenElsewhere, { visitDate: fromNow(-4) });

    const rows = expectOk(await followUps(doctor, { overdue: 'true' }));
    expect(rows.map((r) => r.id)).toEqual([String(stillDue._id)]);
  });

  it('reads overdue=false as the upcoming listing', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const upcoming = await recordFor(doctor, patient, { visitDate: fromNow(-1), followUpDate: fromNow(1) });
    await recordFor(doctor, patient, { visitDate: fromNow(-20), followUpDate: fromNow(-5) });

    const rows = expectOk(await followUps(doctor, { overdue: 'false' }));
    expect(rows.map((r) => r.id)).toEqual([String(upcoming._id)]);
  });

  it('pages and populates the overdue listing like the upcoming one', async () => {
    const doctor = await createActor(ROLES.DOCTOR, { user: { name: 'Dr Who' } });
    const patient = await createActor(ROLES.PATIENT, { user: { name: 'Ada Lovelace' } });
    await recordFor(doctor, patient, { visitDate: fromNow(-40), followUpDate: fromNow(-1) });
    for (let i = 2; i <= 3; i += 1) {
      const other = await createActor(ROLES.PATIENT);
      await recordFor(doctor, other, { visitDate: fromNow(-40), followUpDate: fromNow(-i) });
    }

    const res = await followUps(doctor, { overdue: 'true', limit: 2 });
    const rows = expectOk(res);
    expect(rows).toHaveLength(2);
    expect(res.body.meta.pagination).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(rows.map((r) => r.patient.user.name)).toContain('Test patient');
    expect(rows.every((r) => r.patient.user.name && !r.patient.user.email)).toBe(true);
    expect(rows[0].doctor).toEqual({ id: String(doctor.user._id), name: 'Dr Who' });
  });
});

describe('POST /medical-records/follow-ups/remind — unchanged by the listing', () => {
  it('reminds every patient due tomorrow, unpaged, and still answers { due, sent }', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const doctor = await createActor(ROLES.DOCTOR);
    // More than one default page, so a paged reminder would visibly miss some.
    for (let i = 0; i < 25; i += 1) {
      const patient = await createActor(ROLES.PATIENT);
      await recordFor(doctor, patient, { followUpDate: new Date(Date.now() + 60 * 60 * 1000) });
    }
    const far = await createActor(ROLES.PATIENT);
    await recordFor(doctor, far, { followUpDate: fromNow(5) });

    const res = await api()
      .post(url('/medical-records/follow-ups/remind'))
      .set(admin.headers);
    expect(expectOk(res)).toEqual({ due: 25, sent: 25 });
  });
});

// --- Records list --------------------------------------------------------------

describe('records list — patient names', () => {
  it('populates the patient’s name on /me and /doctor/:id', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT, { user: { name: 'Ada Lovelace' } });
    await recordFor(doctor, patient);

    for (const path of ['/medical-records/me', `/medical-records/doctor/${doctor.user._id}`]) {
      const rows = expectOk(await api().get(url(path)).set(doctor.headers));
      expect(rows[0].patient).toMatchObject({
        id: String(patient.profile._id),
        medicalRecordNumber: patient.profile.medicalRecordNumber,
        user: { id: String(patient.user._id), name: 'Ada Lovelace' },
      });
      expect(rows[0].patient.user).not.toHaveProperty('email');
    }
  });
});

// --- B9: the appointment link on create ----------------------------------------

describe('POST /medical-records — appointment link', () => {
  async function visit({ status = APPOINTMENT_STATUS.COMPLETED } = {}) {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const appointment = await Appointment.create({
      patient: patient.profile._id,
      doctor: doctor.user._id,
      scheduledAt: fromNow(-1),
      durationMinutes: 30,
      status,
    });
    return { doctor, patient, appointment };
  }

  const create = (actor, body) =>
    api().post(url('/medical-records')).set(actor.headers).send({ diagnosis: 'Flu', ...body });

  it('links the record to the doctor’s own appointment with this patient', async () => {
    const { doctor, patient, appointment } = await visit();
    const record = expectOk(
      await create(doctor, {
        patientId: String(patient.profile._id),
        appointmentId: String(appointment._id),
      }),
      201
    );
    expect(record.appointment).toBe(String(appointment._id));
  });

  it('allows a visit that is not yet marked complete', async () => {
    const { doctor, patient, appointment } = await visit({ status: APPOINTMENT_STATUS.CONFIRMED });
    expectOk(
      await create(doctor, {
        patientId: String(patient.profile._id),
        appointmentId: String(appointment._id),
      }),
      201
    );
  });

  it('404s an appointment that does not exist', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    expectError(
      await create(doctor, { patientId: String(patient.profile._id), appointmentId: MISSING_ID }),
      404
    );
  });

  it('rejects an appointment with a different patient', async () => {
    const { doctor, appointment } = await visit();
    const stranger = await createActor(ROLES.PATIENT);
    expectError(
      await create(doctor, {
        patientId: String(stranger.profile._id),
        appointmentId: String(appointment._id),
      }),
      400,
      'APPOINTMENT_MISMATCH'
    );
  });

  it('rejects another doctor’s appointment', async () => {
    const { patient, appointment } = await visit();
    const otherDoctor = await createActor(ROLES.DOCTOR);
    expectError(
      await create(otherDoctor, {
        patientId: String(patient.profile._id),
        appointmentId: String(appointment._id),
      }),
      400,
      'APPOINTMENT_MISMATCH'
    );
  });

  it('refuses a cancelled appointment', async () => {
    const { doctor, patient, appointment } = await visit({ status: APPOINTMENT_STATUS.CANCELLED });
    expectError(
      await create(doctor, {
        patientId: String(patient.profile._id),
        appointmentId: String(appointment._id),
      }),
      409,
      'APPOINTMENT_CANCELLED'
    );
  });

  it('refuses a second record for the same appointment', async () => {
    const { doctor, patient, appointment } = await visit();
    const body = { patientId: String(patient.profile._id), appointmentId: String(appointment._id) };
    expectOk(await create(doctor, body), 201);
    expectError(await create(doctor, body), 409, 'APPOINTMENT_ALREADY_RECORDED');
  });

  it('lets exactly one of two simultaneous records claim the appointment', async () => {
    const { doctor, patient, appointment } = await visit();
    const body = { patientId: String(patient.profile._id), appointmentId: String(appointment._id) };

    const results = await Promise.all([create(doctor, body), create(doctor, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await MedicalRecord.countDocuments({ appointment: appointment._id })).toBe(1);
  });

  it('works as before without an appointment, any number of times', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const body = { patientId: String(patient.profile._id) };
    expect(expectOk(await create(doctor, body), 201).appointment).toBeUndefined();
    expectOk(await create(doctor, body), 201);
  });
});

// --- B12: the latest record, optionally the latest one with vitals --------------

describe('GET /medical-records/patient/:id/latest — withVitals', () => {
  const latest = (actor, patientId, query = {}) =>
    api()
      .get(url(`/medical-records/patient/${patientId}/latest`))
      .query(query)
      .set(actor.headers);

  /** Newest visit has no vitals; the one before it does; the oldest has different ones. */
  async function chartWithGap() {
    const doctor = await createActor(ROLES.DOCTOR, { user: { name: 'Dr. Okafor' } });
    const patient = await createActor(ROLES.PATIENT);
    const oldest = await recordFor(doctor, patient, {
      diagnosis: 'Flu',
      visitDate: fromNow(-30),
      vitals: { heartRateBpm: 90 },
    });
    const withVitals = await recordFor(doctor, patient, {
      diagnosis: 'Hypertension',
      visitDate: fromNow(-20),
      vitals: { systolicBp: 128, diastolicBp: 82 },
    });
    const newest = await recordFor(doctor, patient, { diagnosis: 'Review', visitDate: fromNow(-2) });
    return { doctor, patient, oldest, withVitals, newest };
  }

  it('returns the newest record as before when withVitals is off', async () => {
    const { patient, newest } = await chartWithGap();

    const body = expectOk(await latest(patient, 'me'));

    expect(body.id).toBe(String(newest._id));
    expect(body.vitals).toBeUndefined();
  });

  it.each(['false', false])('treats withVitals=%s as off', async (flag) => {
    const { patient, newest } = await chartWithGap();

    expect(expectOk(await latest(patient, 'me', { withVitals: flag })).id).toBe(String(newest._id));
  });

  it('skips a newer record that has no vitals when withVitals is on', async () => {
    const { patient, withVitals } = await chartWithGap();

    const body = expectOk(await latest(patient, 'me', { withVitals: 'true' }));

    expect(body.id).toBe(String(withVitals._id));
    expect(body.vitals).toMatchObject({ systolicBp: 128, diastolicBp: 82 });
  });

  it('skips a record whose vitals object is present but empty', async () => {
    const { patient, doctor, withVitals } = await chartWithGap();
    await recordFor(doctor, patient, { visitDate: fromNow(-1), vitals: {} });

    const body = expectOk(await latest(patient, 'me', { withVitals: 'true' }));

    expect(body.id).toBe(String(withVitals._id));
  });

  it('counts a zero reading as a value', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const zero = await recordFor(doctor, patient, { vitals: { painScore: 0 } });

    const body = expectOk(await latest(patient, 'me', { withVitals: 'true' }));

    expect(body.id).toBe(String(zero._id));
  });

  it('returns nothing when no record has vitals', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    await recordFor(doctor, patient);

    expect(expectOk(await latest(patient, 'me', { withVitals: 'true' }))).toBeNull();
  });

  it('names the doctor in both modes, and gives away nothing else about them', async () => {
    const { patient, doctor } = await chartWithGap();

    for (const query of [{}, { withVitals: 'true' }]) {
      const body = expectOk(await latest(patient, 'me', query));
      expect(body.doctor).toEqual({ id: String(doctor.user._id), name: 'Dr. Okafor' });
    }
  });

  it('never returns another patient’s vitals', async () => {
    const { patient: owner } = await chartWithGap();
    const snoop = await createActor(ROLES.PATIENT);

    expectError(await latest(snoop, String(owner.profile._id), { withVitals: 'true' }), 403, 'FORBIDDEN');
  });

  it('lets a clinician ask by patient id', async () => {
    const { patient, doctor, withVitals } = await chartWithGap();

    const body = expectOk(await latest(doctor, String(patient.profile._id), { withVitals: 'true' }));

    expect(body.id).toBe(String(withVitals._id));
  });
});
