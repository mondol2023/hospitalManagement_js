'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient } = require('../helpers/factories');
const { CareLog, Notification } = require('../../src/models');
const { ROLES, CARE_LOG_TYPE, MEDICATION_STATUS } = require('../../src/utils/constants');

/**
 * The bedside record, and the wall around it.
 *
 * This file exists to hold one requirement in place: *"nurses can register beds
 * for patients and give the track of giving medicine and other services and send
 * the data where only hospital staff, nurses and doctors see the info"*. Two
 * things follow from that sentence and both are tested here rather than trusted.
 *
 * **Reading is a staff channel.** Not "staff plus the patient" — the patient has
 * no path to this collection at all, not even to their own entries. Raw nursing
 * notes, refused doses and escalation flags are working clinical records; the
 * patient-facing view of their care is the medical record.
 *
 * **Writing is narrower than reading.** An admin may read every chart in the
 * hospital and may still not write one, because a bedside entry attributed to
 * someone who was not at the bedside is a forged clinical record. A nurse may
 * write for a patient they are not formally assigned to *if* they cover the
 * ward — the roster lags reality, and the alternative is a real dose that goes
 * unrecorded.
 *
 * Each of those is one `if` in `accessPolicy`. Each of them is also the kind of
 * `if` that gets "simplified" by someone who does not know why it is there.
 */

/** The care team, the ward, and one admitted patient wired to both. */
async function admitPatient({ ward = 'ICU' } = {}) {
  const doctor = await createActor(ROLES.DOCTOR);
  const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: [ward] } });
  const patient = await createAdmittedPatient({ doctor, nurses: [nurse], ward });
  return { doctor, nurse, patient, ward };
}

const dose = (patient, overrides = {}) => ({
  patientId: String(patient.profile._id),
  name: 'Paracetamol',
  dosage: '500mg',
  route: 'oral',
  ...overrides,
});

describe('care logs — who may write', () => {
  it('lets an assigned nurse chart a dose against the patient', async () => {
    const { nurse, patient } = await admitPatient();

    const res = await api()
      .post(url('/care-logs/medications'))
      .set(nurse.headers)
      .send(dose(patient));
    const log = expectOk(res, 201);

    expect(log.type).toBe(CARE_LOG_TYPE.MEDICATION);
    expect(log.medication).toMatchObject({ name: 'Paracetamol', dosage: '500mg' });
    // Attribution is the point of a legal record: the entry names its author and
    // the role they held, and the ward is copied in at write time so a later
    // transfer cannot rewrite where the dose was given.
    expect(String(log.recordedBy)).toBe(String(nurse.user._id));
    expect(log.recordedByRole).toBe(ROLES.NURSE);
    expect(log.ward).toBe('ICU');
  });

  it('lets a nurse who merely covers the ward chart for an unassigned patient', async () => {
    const ward = 'ICU';
    const patient = await createAdmittedPatient({ ward });
    const covering = await createActor(ROLES.NURSE, { profile: { assignedWards: [ward] } });

    const res = await api()
      .post(url('/care-logs/vitals'))
      .set(covering.headers)
      .send({ patientId: String(patient.profile._id), vitals: { heartRateBpm: 78 } });

    // The roster is always slightly behind the floor. A nurse who actually gave
    // the care must be able to record it, or the chart quietly stops matching
    // what happened — which is worse than a slightly wide write permission.
    expectOk(res, 201);
  });

  it('refuses a nurse whose wards do not cover the patient', async () => {
    const patient = await createAdmittedPatient({ ward: 'ICU' });
    const elsewhere = await createActor(ROLES.NURSE, { profile: { assignedWards: ['Maternity'] } });

    const res = await api()
      .post(url('/care-logs/vitals'))
      .set(elsewhere.headers)
      .send({ patientId: String(patient.profile._id), vitals: { heartRateBpm: 78 } });

    expectError(res, 403);
    expect(await CareLog.countDocuments({})).toBe(0);
  });

  it('refuses a doctor who is not on the care team', async () => {
    const { patient } = await admitPatient();
    const stranger = await createActor(ROLES.DOCTOR);

    const res = await api()
      .post(url('/care-logs/observations'))
      .set(stranger.headers)
      .send({ patientId: String(patient.profile._id), notes: 'Looks fine to me.' });

    // Being a doctor authorises you to chart. It does not authorise you to chart
    // *this* patient — that question needs the patient document, which is why
    // the check is row-level rather than a role list.
    expectError(res, 403);
  });

  it('refuses an admin, who may read every chart but may not write one', async () => {
    const { patient } = await admitPatient();
    const admin = await createActor(ROLES.ADMIN);

    const res = await api()
      .post(url('/care-logs/observations'))
      .set(admin.headers)
      .send({ patientId: String(patient.profile._id), notes: 'Administratively fine.' });

    // `canWriteCareData` lets an admin through — they are unrestricted — and then
    // the clinical-author check stops them. Two gates, deliberately: an audit
    // trail whose author never stood at the bed is not an audit trail.
    expectError(res, 403);
    expect(await CareLog.countDocuments({})).toBe(0);
  });

  it('refuses the patient themself', async () => {
    const { patient } = await admitPatient();

    const res = await api()
      .post(url('/care-logs/observations'))
      .set(patient.headers)
      .send({ patientId: String(patient.profile._id), notes: 'I feel fine, discharge me.' });

    expectError(res, 403);
  });
});

describe('care logs — who may read', () => {
  async function seed() {
    const world = await admitPatient();
    await api()
      .post(url('/care-logs/observations'))
      .set(world.nurse.headers)
      .send({ patientId: String(world.patient.profile._id), notes: 'Settled overnight.' })
      .expect(201);
    return world;
  }

  it('shows the timeline to a clinician', async () => {
    const { doctor, patient } = await seed();

    const res = await api()
      .get(url(`/care-logs/patient/${patient.profile._id}`))
      .set(doctor.headers);
    const entries = expectOk(res);

    expect(entries).toHaveLength(1);
    expect(entries[0].notes).toBe('Settled overnight.');
  });

  it('shows the timeline to an administrator', async () => {
    const { patient } = await seed();
    const manager = await createActor(ROLES.MANAGER);

    const res = await api()
      .get(url(`/care-logs/patient/${patient.profile._id}`))
      .set(manager.headers);

    expect(expectOk(res)).toHaveLength(1);
  });

  it('hides the chart from the patient it belongs to', async () => {
    const { patient } = await seed();

    const own = await api()
      .get(url(`/care-logs/patient/${patient.profile._id}`))
      .set(patient.headers);
    const alias = await api().get(url('/care-logs/patient/me')).set(patient.headers);

    // Both spellings, because `me` is a real alias elsewhere in the API and an
    // endpoint that refuses the id but honours the alias is a hole with a nice
    // ergonomic entrance.
    expectError(own, 403);
    expectError(alias, 403);
  });

  it('hides the chart from staff who are not clinical', async () => {
    const { patient } = await seed();
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const accountant = await createActor(ROLES.ACCOUNTANT);

    // Employment is not clinical need-to-know. A receptionist books appointments
    // and an accountant raises invoices; neither has business in the medication
    // chart, and "staff-only" would have let both of them in.
    expectError(
      await api()
        .get(url(`/care-logs/patient/${patient.profile._id}`))
        .set(receptionist.headers),
      403
    );
    expectError(await api().get(url('/care-logs/ward/ICU')).set(accountant.headers), 403);
  });

  it('gives a nurse their own shift entries', async () => {
    const { nurse } = await seed();

    const res = await api().get(url('/care-logs/me')).set(nurse.headers);

    expect(expectOk(res)).toHaveLength(1);
  });

  it('returns the latest vitals set, not the first', async () => {
    const { nurse, doctor, patient } = await admitPatient();
    const patientId = String(patient.profile._id);

    for (const heartRateBpm of [70, 80]) {
      await api()
        .post(url('/care-logs/vitals'))
        .set(nurse.headers)
        .send({ patientId, vitals: { heartRateBpm } })
        .expect(201);
    }

    const res = await api()
      .get(url(`/care-logs/patient/${patientId}/vitals/latest`))
      .set(doctor.headers);

    expect(expectOk(res).vitals.heartRateBpm).toBe(80);
  });
});

describe('care logs — escalation', () => {
  it('flags out-of-range vitals without being asked', async () => {
    const { nurse, patient } = await admitPatient();

    const res = await api()
      .post(url('/care-logs/vitals'))
      .set(nurse.headers)
      .send({
        patientId: String(patient.profile._id),
        vitals: { oxygenSaturation: 85, heartRateBpm: 140 },
      });

    // The flag is raised by the model, so every write path — REST, socket, a
    // seed script — escalates identically. Leaving it to whoever next opens the
    // chart is exactly how a deterioration gets missed.
    expect(expectOk(res, 201).requiresAttention).toBe(true);
  });

  it('flags a refused dose, and notifies the care team', async () => {
    const { doctor, nurse, patient } = await admitPatient();

    const res = await api()
      .post(url('/care-logs/medications'))
      .set(nurse.headers)
      .send(dose(patient, { status: MEDICATION_STATUS.REFUSED, reason: 'Patient declined' }));

    // A chart that can only record success hides the events a doctor most needs
    // to see, so `refused` is a first-class outcome — and a flagged one.
    expect(expectOk(res, 201).requiresAttention).toBe(true);

    const notified = await Notification.find({ recipient: doctor.user._id });
    expect(notified).toHaveLength(1);
    // The nurse who raised it is not paged about their own entry... except they
    // are, because they are on the care team. What matters is that the doctor is.
    expect(await Notification.countDocuments({ recipient: nurse.user._id })).toBe(1);
  });

  it('rejects a refused dose with no reason', async () => {
    const { nurse, patient } = await admitPatient();

    const res = await api()
      .post(url('/care-logs/medications'))
      .set(nurse.headers)
      .send(dose(patient, { status: MEDICATION_STATUS.MISSED }));

    // The model's per-type rule, surfaced properly. A `ValidatorError` raised in
    // a pre-validate hook is not an instance of `ValidationError`, so without an
    // explicit mapping in the error handler this reached the nurse as a bare 500.
    expectError(res, 422, 'VALIDATION_ERROR');
  });

  it('puts a flagged entry in the attention queue and takes it out again', async () => {
    const { doctor, nurse, patient } = await admitPatient();

    const flagged = await api()
      .post(url('/care-logs/observations'))
      .set(nurse.headers)
      .send({
        patientId: String(patient.profile._id),
        notes: 'Increasingly confused since 04:00.',
        requiresAttention: true,
      })
      .expect(201);
    const logId = flagged.body.data.id;

    const queued = await api().get(url('/care-logs/attention')).set(doctor.headers);
    expect(expectOk(queued).map((entry) => entry.id)).toContain(logId);

    await api()
      .post(url(`/care-logs/${logId}/acknowledge`))
      .set(doctor.headers)
      .send({ note: 'Reviewed, ordering a CT.' })
      .expect(200);

    const after = await api().get(url('/care-logs/attention')).set(doctor.headers);
    expect(expectOk(after)).toHaveLength(0);
  });

  it('lets only the first responder acknowledge', async () => {
    const { doctor, nurse, patient } = await admitPatient();
    const second = await createActor(ROLES.DOCTOR);

    const flagged = await api()
      .post(url('/care-logs/observations'))
      .set(nurse.headers)
      .send({
        patientId: String(patient.profile._id),
        notes: 'Wound site inflamed.',
        requiresAttention: true,
      })
      .expect(201);
    const logId = flagged.body.data.id;

    await api().post(url(`/care-logs/${logId}/acknowledge`)).set(doctor.headers).send({}).expect(200);

    const late = await api()
      .post(url(`/care-logs/${logId}/acknowledge`))
      .set(second.headers)
      .send({});

    // The update is a compare-and-set on `acknowledgedAt: null`, so the record of
    // who actually responded cannot be overwritten by whoever clicked last.
    expectError(late, 409, 'ALREADY_ACKNOWLEDGED');
    const stored = await CareLog.findById(logId);
    expect(String(stored.acknowledgedBy)).toBe(String(doctor.user._id));
  });
});

describe('care logs — corrections', () => {
  async function chartedObservation() {
    const world = await admitPatient();
    const res = await api()
      .post(url('/care-logs/observations'))
      .set(world.nurse.headers)
      .send({ patientId: String(world.patient.profile._id), notes: 'BP 120/80 by cuff.' })
      .expect(201);
    return { ...world, original: res.body.data };
  }

  it('supersedes rather than edits', async () => {
    const { nurse, doctor, patient, original } = await chartedObservation();

    const res = await api()
      .post(url(`/care-logs/${original.id}/correct`))
      .set(nurse.headers)
      .send({ notes: 'BP 120/80 by manual cuff — earlier entry was the wrong patient bay.' });
    const replacement = expectOk(res, 201);

    // The original is still there, unchanged, and still says what it said. A
    // clinical record that can be rewritten after the fact has no evidential
    // value, which is why "correct" means "append", never "update".
    const stored = await CareLog.findById(original.id);
    expect(stored.notes).toBe('BP 120/80 by cuff.');
    expect(String(stored.supersededBy)).toBe(String(replacement.id));

    // ...but the live timeline shows only the correction.
    const timeline = await api()
      .get(url(`/care-logs/patient/${patient.profile._id}`))
      .set(doctor.headers);
    const entries = expectOk(timeline);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(replacement.id);
  });

  it('keeps the correction on the original patient and at the original time', async () => {
    const { nurse, patient, original } = await chartedObservation();
    const otherPatient = await createAdmittedPatient({ ward: 'ICU' });

    const res = await api()
      .post(url(`/care-logs/${original.id}/correct`))
      .set(nurse.headers)
      .send({
        notes: 'Corrected.',
        // Both of these are ignored: a correction that could move the event to
        // another patient or another time would defeat the whole audit trail.
        patientId: String(otherPatient.profile._id),
        performedAt: new Date(0).toISOString(),
      });
    const replacement = expectOk(res, 201);

    expect(String(replacement.patient)).toBe(String(patient.profile._id));
    expect(new Date(replacement.performedAt).toISOString()).toBe(
      new Date(original.performedAt).toISOString()
    );
  });

  it('refuses to correct an entry twice', async () => {
    const { nurse, original } = await chartedObservation();

    await api()
      .post(url(`/care-logs/${original.id}/correct`))
      .set(nurse.headers)
      .send({ notes: 'First correction.' })
      .expect(201);

    const again = await api()
      .post(url(`/care-logs/${original.id}/correct`))
      .set(nurse.headers)
      .send({ notes: 'Second correction.' });

    // Corrections chain off the *latest* entry. Allowing two children of one
    // parent would make "which version is current?" unanswerable.
    expectError(again, 409);
  });

  it('refuses a correction from a clinician outside the care team', async () => {
    const { original } = await chartedObservation();
    const stranger = await createActor(ROLES.NURSE, { profile: { assignedWards: ['Maternity'] } });

    const res = await api()
      .post(url(`/care-logs/${original.id}/correct`))
      .set(stranger.headers)
      .send({ notes: 'Not my patient, but here is my opinion.' });

    // There is no `patientId` in this body to gate on, so the service resolves
    // the patient from the entry itself and applies the same write rule. The
    // route has no middleware here — this asserts the service is not trusting it.
    expectError(res, 403);
  });
});

describe('care logs — handover', () => {
  it('records the handover and notifies the incoming nurse', async () => {
    const { nurse, patient, ward } = await admitPatient();
    const incoming = await createActor(ROLES.NURSE, { profile: { assignedWards: [ward] } });

    const res = await api()
      .post(url('/care-logs/handovers'))
      .set(nurse.headers)
      .send({
        patientId: String(patient.profile._id),
        toNurseUserId: String(incoming.user._id),
        summary: 'Stable. Due 22:00 antibiotics. Family visiting at 20:00.',
        outstandingTasks: ['Chase phlebotomy', 'Repeat obs at 21:00'],
      });
    const log = expectOk(res, 201);

    expect(log.type).toBe(CARE_LOG_TYPE.HANDOVER);
    expect(log.handover.outstandingTasks).toHaveLength(2);

    // Pushed, not published: the incoming nurse is told, rather than being
    // expected to notice a new row in a feed they may not have open.
    const notified = await Notification.find({ recipient: incoming.user._id });
    expect(notified).toHaveLength(1);
    expect(notified[0].title).toBe('Shift handover received');
  });
});
