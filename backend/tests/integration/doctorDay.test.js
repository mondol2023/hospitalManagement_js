'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { Appointment } = require('../../src/models');
const { ROLES, APPOINTMENT_STATUS } = require('../../src/utils/constants');

/**
 * The doctor's day (slice 4b, B7): one row per visit, with the patient's name,
 * ready to render as "My day".
 *
 * Appointments are written through the model, not the booking API: the day view
 * is about what is on the calendar, and a fixed past date keeps the window
 * independent of "now" and of the doctor's published hours.
 *
 * Once rows carry patient names the list is clinical-adjacent, so only the
 * doctor themselves, administrators and the front desk may read it (D3).
 */

const DAY = '2030-01-15';
const at = (hhmm) => new Date(`${DAY}T${hhmm}:00.000Z`);

async function scheduleOf(doctor, rows) {
  return Promise.all(
    rows.map(({ patient, time, status = APPOINTMENT_STATUS.CONFIRMED, reason }) =>
      Appointment.create({
        patient: patient.profile._id,
        doctor: doctor.user._id,
        scheduledAt: at(time),
        durationMinutes: 30,
        status,
        reason,
      })
    )
  );
}

const day = (actor, doctor, query = {}) =>
  api()
    .get(url(`/appointments/doctor/${doctor.user._id}/day`))
    .query({ date: DAY, ...query })
    .set(actor.headers);

describe('appointments — the doctor’s day carries patient names', () => {
  it('populates the patient’s MRN and name, in time order', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const ada = await createActor(ROLES.PATIENT, { user: { name: 'Ada Lovelace' } });
    const alan = await createActor(ROLES.PATIENT, { user: { name: 'Alan Turing' } });
    await scheduleOf(doctor, [
      { patient: alan, time: '11:00', reason: 'Review' },
      { patient: ada, time: '09:30', reason: 'Cough' },
    ]);

    const rows = expectOk(await day(doctor, doctor));

    expect(rows.map((r) => r.patient.user.name)).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(rows[0]).toMatchObject({
      reason: 'Cough',
      status: APPOINTMENT_STATUS.CONFIRMED,
      durationMinutes: 30,
      patient: {
        id: String(ada.profile._id),
        medicalRecordNumber: ada.profile.medicalRecordNumber,
      },
    });
    expect(rows[0].id).toEqual(expect.any(String));
    expect(new Date(rows[0].scheduledAt).toISOString()).toBe(at('09:30').toISOString());
    expect(new Date(rows[0].endsAt).toISOString()).toBe(at('10:00').toISOString());
  });

  it('leaves out finished visits unless includeClosed is set, and never shows cancelled ones', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    await scheduleOf(doctor, [
      { patient, time: '09:00', status: APPOINTMENT_STATUS.COMPLETED },
      { patient, time: '10:00', status: APPOINTMENT_STATUS.NO_SHOW },
      { patient, time: '11:00', status: APPOINTMENT_STATUS.CANCELLED },
      { patient, time: '12:00', status: APPOINTMENT_STATUS.CONFIRMED },
      { patient, time: '13:00', status: APPOINTMENT_STATUS.PENDING },
    ]);

    const statuses = async (query) => expectOk(await day(doctor, doctor, query)).map((r) => r.status);

    const live = [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING];
    expect(await statuses({})).toEqual(live);
    // `z.coerce.boolean()` would read the string "false" as true.
    expect(await statuses({ includeClosed: 'false' })).toEqual(live);
    expect(await statuses({ includeClosed: 'true' })).toEqual([
      APPOINTMENT_STATUS.COMPLETED,
      APPOINTMENT_STATUS.NO_SHOW,
      ...live,
    ]);
  });

  it('rejects an includeClosed that is not a boolean', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    expectError(await day(doctor, doctor, { includeClosed: 'maybe' }), 422);
  });

  it('keeps the availability calculation on live appointments only', async () => {
    const doctor = await createActor(ROLES.DOCTOR, {
      profile: { timeSlots: [{ start: '09:00', end: '17:00' }], slotDurationMinutes: 30 },
    });
    const patient = await createActor(ROLES.PATIENT);
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 9, 0)
    );
    await Appointment.create({
      patient: patient.profile._id,
      doctor: doctor.user._id,
      scheduledAt: tomorrow,
      durationMinutes: 30,
      status: APPOINTMENT_STATUS.CANCELLED,
    });

    const res = await api()
      .get(url(`/doctors/by-user/${doctor.user._id}/availability`))
      .query({ date: tomorrow.toISOString() })
      .set(patient.headers);
    const { slots } = expectOk(res);

    const nine = slots.find((s) => new Date(s.startsAt).getTime() === tomorrow.getTime());
    expect(nine.available).toBe(true);
  });
});

describe('appointments — who may read a doctor’s day (D3)', () => {
  it('lets administrators and the front desk read it', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    await scheduleOf(doctor, [{ patient, time: '09:00' }]);

    for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST]) {
      const actor = await createActor(role);
      expect(expectOk(await day(actor, doctor))).toHaveLength(1);
    }
  });

  it('refuses another doctor, a nurse, a pharmacist, an accountant and a patient', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    for (const role of [ROLES.DOCTOR, ROLES.NURSE, ROLES.PHARMACIST, ROLES.ACCOUNTANT, ROLES.PATIENT]) {
      const actor = await createActor(role);
      expectError(await day(actor, doctor), 403, 'FORBIDDEN');
    }
  });
});
