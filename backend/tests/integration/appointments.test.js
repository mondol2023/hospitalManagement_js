'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { Appointment } = require('../../src/models');
const { ROLES, APPOINTMENT_STATUS } = require('../../src/utils/constants');

/**
 * Appointments: the calendar, and every way two people try to occupy one slot.
 *
 * **Availability is derived, so the tests must respect the derivation.** A doctor
 * with no configured `timeSlots` publishes *no* slots — deliberately, because
 * inventing office hours for an unconfigured doctor is worse than showing none.
 * Every doctor here is therefore built with a real working window, and every
 * `scheduledAt` lands exactly on a boundary the generator produces. A test that
 * posted a plausible-looking timestamp would get a 409 and prove nothing.
 *
 * **A slot is a mutually exclusive resource, and the defence has three layers.**
 * Availability hides a taken slot, an overlap query rejects it, and the partial
 * unique index is the final authority. Only the third holds under concurrency, so
 * the sequential test below asserts the friendly `SLOT_UNAVAILABLE` while the
 * concurrent one fires both requests at once and insists exactly one row exists
 * afterwards. A suite that only booked one at a time would pass against a
 * read-then-write implementation that double-books under load.
 *
 * **Two independent clashes.** A doctor cannot be in two consultations at once,
 * and neither can a patient — the second is easy to forget because it never shows
 * up on the doctor's own calendar. It has its own code and its own test.
 *
 * **Outcome statuses are a clinical judgement.** Confirm, complete and no-show
 * are blocked at the route *and* inside `transition()`. The route gate is what
 * these tests exercise; the duplication is intentional, so a future route that
 * forgets the gate still cannot let a patient close their own visit.
 */

const MISSING_ID = '507f1f77bcf86cd799439011';

/** The working window every fixture doctor publishes. */
const WINDOW = { start: '09:00', end: '17:00' };

/** A doctor who actually has bookable hours. */
const bookableDoctor = (profile = {}) =>
  createActor(ROLES.DOCTOR, {
    profile: { timeSlots: [WINDOW], slotDurationMinutes: 30, ...profile },
  });

/**
 * A boundary the slot generator really emits: UTC midnight of a future day plus
 * a whole number of steps into the published window. `availability` drops
 * anything not strictly in the future, so `days` defaults to tomorrow.
 */
function slotAt({ days = 1, hour = 9, minute = 0 } = {}) {
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days);
  return new Date(dayStart + (hour * 60 + minute) * 60_000);
}

const book = (actor, body) => api().post(url('/appointments')).set(actor.headers).send(body);

/** The common case: one patient, one doctor, one confirmed-or-pending booking. */
async function booked({ actor, patient, doctor, at = slotAt(), ...rest } = {}) {
  const asPatient = patient || (await createActor(ROLES.PATIENT));
  const withDoctor = doctor || (await bookableDoctor());
  const booker = actor || asPatient;

  const res = await book(booker, {
    doctorUserId: String(withDoctor.user._id),
    scheduledAt: at.toISOString(),
    ...(booker === asPatient ? {} : { patientId: String(asPatient.profile._id) }),
    ...rest,
  });
  const appointment = expectOk(res, 201);
  return { appointment, patient: asPatient, doctor: withDoctor, at };
}

describe('appointments — booking respects the doctor’s published hours', () => {
  it('books a patient into a slot the doctor actually offers', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();
    const at = slotAt({ hour: 10, minute: 30 });

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: at.toISOString(),
      reason: 'Persistent cough',
    });
    const appointment = expectOk(res, 201);

    expect(appointment.status).toBe(APPOINTMENT_STATUS.PENDING);
    expect(appointment.doctor).toBe(String(doctor.user._id));
    expect(appointment.patient).toBe(String(patient.profile._id));
    expect(appointment.durationMinutes).toBe(30);
    // `endsAt` is derived in a pre-validate hook, not sent by the client — the
    // overlap query depends on it, so it has to be right without being trusted.
    expect(new Date(appointment.endsAt).getTime()).toBe(at.getTime() + 30 * 60_000);
    expect(appointment.createdBy).toBe(String(patient.user._id));
  });

  it('confirms immediately when staff book at the desk', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await book(receptionist, {
      patientId: String(patient.profile._id),
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    // A patient's own request is a request; a slot agreed at the desk is agreed.
    expect(expectOk(res, 201).status).toBe(APPOINTMENT_STATUS.CONFIRMED);
  });

  it('refuses a staff booking that names no patient', async () => {
    const doctor = await bookableDoctor();
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await book(receptionist, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    expect(expectError(res, 400, 'BAD_REQUEST').message).toMatch(/patient id/i);
  });

  it('ignores a patientId supplied by a patient, booking them into their own record', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const other = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();

    const res = await book(patient, {
      patientId: String(other.profile._id),
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    // Otherwise anyone could fill a stranger's calendar from their own account.
    expect(expectOk(res, 201).patient).toBe(String(patient.profile._id));
  });

  it.each([
    ['before the window opens', { hour: 8, minute: 0 }],
    ['after the window closes', { hour: 17, minute: 30 }],
    ['off the slot boundary', { hour: 9, minute: 15 }],
  ])('rejects a time %s', async (_label, when) => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt(when).toISOString(),
    });

    expectError(res, 409, 'SLOT_UNAVAILABLE');
    await expect(Appointment.countDocuments()).resolves.toBe(0);
  });

  it('rejects a duration that overruns the slot it starts in', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
      durationMinutes: 60,
    });

    // The start is offered; the *end* is not. Accepting this would silently eat
    // the following slot without it ever showing as booked.
    expectError(res, 409, 'SLOT_UNAVAILABLE');
  });

  it('rejects a time in the past', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt({ days: -1 }).toISOString(),
    });

    expect(expectError(res, 400, 'BAD_REQUEST').message).toMatch(/past/i);
  });

  it('rejects a doctor who is not accepting patients', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor({ isAcceptingPatients: false });

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    expectError(res, 409, 'SLOT_UNAVAILABLE');
  });

  it('rejects a user who is not a doctor at all', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const nurse = await createActor(ROLES.NURSE);

    const res = await book(patient, {
      doctorUserId: String(nurse.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    expect(expectError(res, 400, 'BAD_REQUEST').message).toMatch(/active doctor/i);
  });

  it('rejects a doctor whose account has been deactivated', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await bookableDoctor();
    await doctor.user.updateOne({ isActive: false });

    const res = await book(patient, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    });

    // A doctor who has left must vanish from the calendar, not merely from search.
    expect(expectError(res, 400, 'BAD_REQUEST').message).toMatch(/active doctor/i);
  });

  it('rejects an unauthenticated booking', async () => {
    const res = await api().post(url('/appointments')).send({});
    expectError(res, 401, 'TOKEN_MISSING');
  });
});

describe('appointments — a slot cannot be sold twice', () => {
  it('hides a taken slot from the next caller', async () => {
    const doctor = await bookableDoctor();
    const at = slotAt();
    await booked({ doctor, at });

    const second = await createActor(ROLES.PATIENT);
    const res = await book(second, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: at.toISOString(),
    });

    // Layer one: availability already subtracted the booking, so the caller gets
    // "not available" rather than a database code.
    expectError(res, 409, 'SLOT_UNAVAILABLE');
    await expect(Appointment.countDocuments()).resolves.toBe(1);
  });

  it('lets exactly one of two simultaneous requests win the slot', async () => {
    const doctor = await bookableDoctor();
    const [first, second] = await Promise.all([
      createActor(ROLES.PATIENT),
      createActor(ROLES.PATIENT),
    ]);
    const body = {
      doctorUserId: String(doctor.user._id),
      scheduledAt: slotAt().toISOString(),
    };

    const results = await Promise.all([book(first, body), book(second, body)]);
    const statuses = results.map((res) => res.status).sort();

    expect(statuses).toEqual([201, 409]);
    // Whichever layer catches the loser — the overlap query or the unique index —
    // the outcome the ward cares about is that the slot was sold once.
    const loser = results.find((res) => res.status === 409);
    expect(['SLOT_TAKEN', 'SLOT_UNAVAILABLE']).toContain(loser.body.error.code);
    await expect(Appointment.countDocuments()).resolves.toBe(1);
  });

  it('returns the slot to the pool once the appointment is cancelled', async () => {
    const doctor = await bookableDoctor();
    const at = slotAt();
    const { appointment, patient } = await booked({ doctor, at });

    await api()
      .post(url(`/appointments/${appointment.id}/cancel`))
      .set(patient.headers)
      .send({ reason: 'Feeling better' })
      .expect(200);

    const next = await createActor(ROLES.PATIENT);
    const res = await book(next, {
      doctorUserId: String(doctor.user._id),
      scheduledAt: at.toISOString(),
    });

    // The unique index is partial for exactly this reason: a cancelled row must
    // not hold the slot hostage forever.
    expectOk(res, 201);
  });

  it('refuses to put one patient in two consultations at once', async () => {
    const at = slotAt();
    const { patient } = await booked({ at });
    const otherDoctor = await bookableDoctor();

    const res = await book(patient, {
      doctorUserId: String(otherDoctor.user._id),
      scheduledAt: at.toISOString(),
    });

    // Never visible on either doctor's calendar, which is why it needs its own check.
    expectError(res, 409, 'PATIENT_DOUBLE_BOOKED');
    await expect(Appointment.countDocuments()).resolves.toBe(1);
  });
});

describe('appointments — who may see which appointment', () => {
  it('lets the patient it belongs to read it', async () => {
    const { appointment, patient, doctor } = await booked();

    const res = await api()
      .get(url(`/appointments/${appointment.id}`))
      .set(patient.headers);
    const body = expectOk(res);

    expect(body.id).toBe(appointment.id);
    expect(body.doctor.name).toBe(doctor.user.name);
  });

  it('refuses another patient', async () => {
    const { appointment } = await booked();
    const stranger = await createActor(ROLES.PATIENT);

    const res = await api()
      .get(url(`/appointments/${appointment.id}`))
      .set(stranger.headers);

    expectError(res, 403, 'FORBIDDEN');
  });

  it('lets front-desk staff read any appointment', async () => {
    const { appointment } = await booked();
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await api()
      .get(url(`/appointments/${appointment.id}`))
      .set(receptionist.headers);

    expectOk(res);
  });

  it('404s an unknown id and 422s a malformed one', async () => {
    const staff = await createActor(ROLES.RECEPTIONIST);

    const missing = await api().get(url(`/appointments/${MISSING_ID}`)).set(staff.headers);
    expectError(missing, 404, 'NOT_FOUND');

    const malformed = await api().get(url('/appointments/not-an-id')).set(staff.headers);
    expectError(malformed, 422, 'VALIDATION_ERROR');
  });

  it('shows a patient only their own appointments', async () => {
    const doctor = await bookableDoctor();
    const { patient } = await booked({ doctor, at: slotAt({ hour: 9 }) });
    await booked({ doctor, at: slotAt({ hour: 11 }) });

    const res = await api().get(url('/appointments')).set(patient.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].patient).toBe(String(patient.profile._id));
    expect(res.body.meta.pagination).toEqual(expect.objectContaining({ total: 1, page: 1 }));
  });

  it('shows a doctor their own calendar', async () => {
    const doctor = await bookableDoctor();
    await booked({ doctor, at: slotAt({ hour: 9 }) });
    await booked({ doctor, at: slotAt({ hour: 13 }) });
    await booked(); // someone else's doctor entirely

    const res = await api().get(url('/appointments')).set(doctor.headers);

    expect(expectOk(res)).toHaveLength(2);
  });

  it('filters the staff view by status', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const doctor = await bookableDoctor();
    await booked({ doctor, at: slotAt({ hour: 9 }) }); // pending, by the patient
    await booked({ doctor, at: slotAt({ hour: 14 }), actor: receptionist }); // confirmed, at the desk

    const res = await api()
      .get(url('/appointments'))
      .query({ status: APPOINTMENT_STATUS.CONFIRMED })
      .set(receptionist.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe(APPOINTMENT_STATUS.CONFIRMED);
  });

  it('keeps the doctor’s calendar and day view away from patients', async () => {
    const { doctor, patient, at } = await booked();

    const calendar = await api()
      .get(url(`/appointments/doctor/${doctor.user._id}`))
      .set(patient.headers);
    expectError(calendar, 403, 'FORBIDDEN');

    const day = await api()
      .get(url(`/appointments/doctor/${doctor.user._id}/day`))
      .query({ date: at.toISOString() })
      .set(patient.headers);
    expectError(day, 403, 'FORBIDDEN');

    // A whole ward's day, listing named patients, is staff information.
    const staff = await createActor(ROLES.NURSE);
    const asStaff = await api()
      .get(url(`/appointments/doctor/${doctor.user._id}/day`))
      .query({ date: at.toISOString() })
      .set(staff.headers);

    expect(expectOk(asStaff)).toHaveLength(1);
  });
});

describe('appointments — the lifecycle is a state machine', () => {
  it('walks pending → confirmed → completed', async () => {
    const { appointment, doctor } = await booked();

    const confirmed = await api()
      .post(url(`/appointments/${appointment.id}/confirm`))
      .set(doctor.headers);
    expect(expectOk(confirmed).status).toBe(APPOINTMENT_STATUS.CONFIRMED);

    const completed = await api()
      .post(url(`/appointments/${appointment.id}/complete`))
      .set(doctor.headers)
      .send({ notes: 'Prescribed rest and fluids' });
    expect(expectOk(completed).status).toBe(APPOINTMENT_STATUS.COMPLETED);
  });

  it('refuses a transition the table does not allow', async () => {
    const { appointment, doctor } = await booked();

    // pending → completed skips the confirmation the clinic actually needs.
    const early = await api()
      .post(url(`/appointments/${appointment.id}/complete`))
      .set(doctor.headers)
      .send({});
    expectError(early, 409, 'INVALID_TRANSITION');

    await api().post(url(`/appointments/${appointment.id}/confirm`)).set(doctor.headers).expect(200);

    const again = await api()
      .post(url(`/appointments/${appointment.id}/confirm`))
      .set(doctor.headers);
    expectError(again, 409, 'INVALID_TRANSITION');
  });

  it('treats a closed appointment as final', async () => {
    const { appointment, doctor, patient } = await booked();
    await api().post(url(`/appointments/${appointment.id}/confirm`)).set(doctor.headers).expect(200);
    await api()
      .post(url(`/appointments/${appointment.id}/complete`))
      .set(doctor.headers)
      .send({})
      .expect(200);

    const cancel = await api()
      .post(url(`/appointments/${appointment.id}/cancel`))
      .set(patient.headers)
      .send({ reason: 'Changed my mind' });

    // Cancelling a visit that already happened would corrupt the billing record.
    expectError(cancel, 409, 'INVALID_TRANSITION');
  });

  it('marks a confirmed appointment as a no-show', async () => {
    const { appointment, doctor } = await booked();
    await api().post(url(`/appointments/${appointment.id}/confirm`)).set(doctor.headers).expect(200);

    const res = await api()
      .post(url(`/appointments/${appointment.id}/no-show`))
      .set(doctor.headers);

    expect(expectOk(res).status).toBe(APPOINTMENT_STATUS.NO_SHOW);
  });

  it.each([['confirm'], ['complete'], ['no-show']])(
    'does not let a patient %s their own appointment',
    async (action) => {
      const { appointment, patient } = await booked();

      const res = await api()
        .post(url(`/appointments/${appointment.id}/${action}`))
        .set(patient.headers)
        .send({});

      expectError(res, 403, 'FORBIDDEN');
      const after = await Appointment.findById(appointment.id).lean();
      expect(after.status).toBe(APPOINTMENT_STATUS.PENDING);
    }
  );

  it('lets a patient cancel their own booking, recording who and why', async () => {
    const { appointment, patient } = await booked();

    const res = await api()
      .post(url(`/appointments/${appointment.id}/cancel`))
      .set(patient.headers)
      .send({ reason: 'Away that week' });

    expect(expectOk(res).status).toBe(APPOINTMENT_STATUS.CANCELLED);
    const stored = await Appointment.findById(appointment.id).lean();
    expect(stored.cancellationReason).toBe('Away that week');
    expect(String(stored.cancelledBy)).toBe(String(patient.user._id));
  });

  it('refuses a stranger’s cancellation', async () => {
    const { appointment } = await booked();
    const stranger = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url(`/appointments/${appointment.id}/cancel`))
      .set(stranger.headers)
      .send({});

    expectError(res, 403, 'FORBIDDEN');
    const after = await Appointment.findById(appointment.id).lean();
    expect(after.status).toBe(APPOINTMENT_STATUS.PENDING);
  });
});

describe('appointments — rescheduling re-runs every booking check', () => {
  const move = (appointment, actor, at, body = {}) =>
    api()
      .patch(url(`/appointments/${appointment.id}/reschedule`))
      .set(actor.headers)
      .send({ scheduledAt: at.toISOString(), ...body });

  it('moves an appointment to another free slot', async () => {
    const { appointment, patient } = await booked({ at: slotAt({ hour: 9 }) });
    const later = slotAt({ hour: 15, minute: 30 });

    const moved = expectOk(await move(appointment, patient, later));

    expect(new Date(moved.scheduledAt).getTime()).toBe(later.getTime());
    // Re-derived, not carried over from the original booking.
    expect(new Date(moved.endsAt).getTime()).toBe(later.getTime() + 30 * 60_000);
  });

  it('will not move an appointment onto an occupied slot', async () => {
    const doctor = await bookableDoctor();
    const taken = slotAt({ hour: 9 });
    await booked({ doctor, at: taken });
    const { appointment, patient } = await booked({ doctor, at: slotAt({ hour: 10 }) });

    expectError(await move(appointment, patient, taken), 409, 'SLOT_UNAVAILABLE');

    const stored = await Appointment.findById(appointment.id).lean();
    expect(stored.scheduledAt.getTime()).toBe(slotAt({ hour: 10 }).getTime());
  });

  it.each([
    ['outside the doctor’s hours', () => slotAt({ hour: 20 }), 409, 'SLOT_UNAVAILABLE'],
    ['into the past', () => slotAt({ days: -2 }), 400, 'BAD_REQUEST'],
  ])('refuses a move %s', async (_label, when, status, code) => {
    const { appointment, patient } = await booked();

    expectError(await move(appointment, patient, when()), status, code);
  });

  it('refuses to move an appointment that has already happened', async () => {
    const { appointment, doctor, patient } = await booked();
    await api().post(url(`/appointments/${appointment.id}/confirm`)).set(doctor.headers).expect(200);
    await api()
      .post(url(`/appointments/${appointment.id}/complete`))
      .set(doctor.headers)
      .send({})
      .expect(200);

    const res = await move(appointment, patient, slotAt({ hour: 16 }));

    expect(expectError(res, 409, 'CONFLICT').message).toMatch(/cannot be rescheduled/i);
  });

  it('refuses a stranger’s reschedule', async () => {
    const { appointment } = await booked();
    const stranger = await createActor(ROLES.PATIENT);

    expectError(await move(appointment, stranger, slotAt({ hour: 16 })), 403, 'FORBIDDEN');
  });
});
