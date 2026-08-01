'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient, createBed } = require('../helpers/factories');
const bedService = require('../../src/services/bedService');
const { Bed, Patient, CareLog, Notification } = require('../../src/models');
const { ROLES, BED_STATUS, CARE_LOG_TYPE } = require('../../src/utils/constants');

/**
 * Beds: inventory, admission, and the bookkeeping that has to survive both.
 *
 * The requirement this file holds in place is *"nurses can register beds for
 * patients"*, and almost everything here is about the ways that can go wrong
 * rather than the way it goes right.
 *
 * **A bed is a mutually exclusive resource.** Two nurses admitting at the same
 * instant is not a hypothetical — it is a Tuesday morning at the admissions desk.
 * The claim is therefore a compare-and-set in the database, and the test below
 * fires both requests at once and insists exactly one wins. A suite that only
 * admits patients one at a time would pass against a read-then-write
 * implementation that loses a patient under load.
 *
 * **Two collections have to agree.** The bed knows its patient and the patient
 * knows their bed; if one write lands and the other does not, the ward ends up
 * with a bed nobody can ever use again. Every admission test asserts both
 * documents, not just the response body.
 *
 * **Who may do what splits three ways.** Inventory is administration
 * (admin-only). Admission is ward work, which includes the admitting desk at 3am
 * — so a receptionist may do it and, deliberately, a *doctor* may not; doctors do
 * not run the bed board. And the whole router is staff-only, because a bed board
 * says which named patient is in which ward.
 */

/** Polls until `check` returns something truthy, for the fire-and-forget paths. */
async function eventually(check, { attempts = 20, delayMs = 25 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await check();
    if (result && (!Array.isArray(result) || result.length)) return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

/** An admitted patient with no bed yet, plus the staff who can give them one. */
async function ward({ ward: name = 'ICU' } = {}) {
  const admin = await createActor(ROLES.ADMIN);
  const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: [name] } });
  const patient = await createAdmittedPatient({ nurses: [nurse], ward: name });
  const bed = await createBed({ ward: name });
  return { admin, nurse, patient, bed, ward: name };
}

const assign = (bed, patient, actor) =>
  api()
    .post(url(`/beds/${bed._id}/assign`))
    .set(actor.headers)
    .send({ patientId: String(patient.profile._id) });

describe('beds — inventory is admin-only', () => {
  it('lets an administrator register a bed, normalising the number', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const res = await api()
      .post(url('/beds'))
      .set(admin.headers)
      .send({ bedNumber: 'a-12', ward: 'ICU', floor: 2, type: 'icu', dailyRate: 250 });
    const bed = expectOk(res, 201);

    // Uppercased by the schema so `a-12` and `A-12` cannot coexist as two beds.
    expect(bed.bedNumber).toBe('A-12');
    expect(bed.status).toBe(BED_STATUS.AVAILABLE);
    expect(bed.patient).toBeNull();
    expect(bed.id).toBeDefined();
  });

  it('refuses a second bed with the same number in the same ward', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const body = { bedNumber: 'B-1', ward: 'ICU' };

    expectOk(await api().post(url('/beds')).set(admin.headers).send(body), 201);
    const res = await api().post(url('/beds')).set(admin.headers).send(body);

    expectError(res, 409);
    expect(await Bed.countDocuments({ ward: 'ICU' })).toBe(1);
  });

  it('allows the same bed number in a different ward', async () => {
    const admin = await createActor(ROLES.ADMIN);

    expectOk(
      await api().post(url('/beds')).set(admin.headers).send({ bedNumber: 'B-1', ward: 'ICU' }),
      201
    );
    expectOk(
      await api()
        .post(url('/beds'))
        .set(admin.headers)
        .send({ bedNumber: 'B-1', ward: 'Maternity' }),
      201
    );
  });

  it('refuses a nurse creating, editing or retiring inventory', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const bed = await createBed();

    expectError(
      await api().post(url('/beds')).set(nurse.headers).send({ bedNumber: 'C-1', ward: 'ICU' }),
      403,
      'FORBIDDEN'
    );
    expectError(
      await api().patch(url(`/beds/${bed._id}`)).set(nurse.headers).send({ dailyRate: 1 }),
      403,
      'FORBIDDEN'
    );
    expectError(
      await api().delete(url(`/beds/${bed._id}`)).set(nurse.headers).send(),
      403,
      'FORBIDDEN'
    );

    // The bed is untouched — a 403 that still applied the write would be worse
    // than no check at all.
    const stored = await Bed.findById(bed._id);
    expect(stored.dailyRate).toBe(0);
  });

  it('refuses to retire an occupied bed', async () => {
    const { admin, nurse, patient, bed } = await ward();
    expectOk(await assign(bed, patient, nurse));

    expectError(await api().delete(url(`/beds/${bed._id}`)).set(admin.headers).send(), 409);
    expect(await Bed.countDocuments({ _id: bed._id })).toBe(1);
  });

  it('keeps the whole bed board away from patients', async () => {
    const patient = await createActor(ROLES.PATIENT);

    for (const path of ['/beds', '/beds/available', '/beds/occupancy', '/beds/wards']) {
      expectError(await api().get(url(path)).set(patient.headers), 403, 'FORBIDDEN');
    }
  });
});

describe('beds — admission', () => {
  it('registers a bed for a patient and syncs both documents', async () => {
    const { nurse, patient, bed } = await ward();

    const body = expectOk(await assign(bed, patient, nurse));
    expect(body.status).toBe(BED_STATUS.OCCUPIED);
    expect(String(body.patient)).toBe(String(patient.profile._id));

    const storedBed = await Bed.findById(bed._id);
    expect(storedBed.status).toBe(BED_STATUS.OCCUPIED);
    expect(storedBed.occupiedAt).toBeInstanceOf(Date);

    // The patient side of the same fact. A bed that knows its patient while the
    // patient does not know their bed is the state that strands a bed forever.
    const storedPatient = await Patient.findById(patient.profile._id);
    expect(String(storedPatient.bed)).toBe(String(bed._id));
    expect(storedPatient.isAdmitted).toBe(true);
    expect(storedPatient.ward).toBe('ICU');
  });

  it('lets the admitting desk admit, and keeps a doctor out of the bed board', async () => {
    const { patient, bed } = await ward();
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const doctor = await createActor(ROLES.DOCTOR);

    expectError(await assign(bed, patient, doctor), 403, 'FORBIDDEN');
    expectOk(await assign(bed, patient, receptionist));
  });

  it('charts a clinician’s admission and does not forge one for a clerk', async () => {
    const first = await ward();
    expectOk(await assign(first.bed, first.patient, first.nurse));

    const charted = await eventually(() =>
      CareLog.find({ patient: first.patient.profile._id, type: CARE_LOG_TYPE.BED_ASSIGNMENT })
    );
    expect(charted).toHaveLength(1);
    expect(String(charted[0].recordedBy)).toBe(String(first.nurse.user._id));
    expect(charted[0].recordedByRole).toBe(ROLES.NURSE);
    expect(String(charted[0].bed)).toBe(String(first.bed._id));

    // The clerk's admission is real and recorded on the bed and the patient — it
    // is simply not written into the chart as a nursing entry, because a clerk
    // was not at the bedside.
    const second = await ward({ ward: 'Maternity' });
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    expectOk(await assign(second.bed, second.patient, receptionist));

    expect(await CareLog.countDocuments({ patient: second.patient.profile._id })).toBe(0);
    expect(await Bed.findById(second.bed._id)).toMatchObject({ status: BED_STATUS.OCCUPIED });
  });

  it('tells the patient their bed changed', async () => {
    const { nurse, patient, bed } = await ward();
    expectOk(await assign(bed, patient, nurse));

    const inbox = await eventually(() => Notification.find({ recipient: patient.user._id }));
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title).toBe('Bed updated');
    expect(inbox[0].message).toContain(bed.bedNumber);
  });

  it('gives the bed to exactly one of two simultaneous admissions', async () => {
    const { nurse, patient, bed, ward: name } = await ward();
    const other = await createAdmittedPatient({ nurses: [nurse], ward: name });

    // The whole reason `occupyIfFree` is a compare-and-set rather than a read
    // followed by a write. Under read-then-write both of these pass the check and
    // the second silently evicts the first patient from their own bed.
    const results = await Promise.all([
      assign(bed, patient, nurse),
      assign(bed, other, nurse),
    ]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 409]);

    const loser = results.find((res) => res.status === 409);
    expect(loser.body.error.code).toBe('BED_TAKEN');

    const stored = await Bed.findById(bed._id);
    const admitted = await Patient.find({ bed: bed._id });
    expect(admitted).toHaveLength(1);
    expect(String(stored.patient)).toBe(String(admitted[0]._id));
  });

  it('refuses to admit a patient who already has a bed', async () => {
    const { nurse, patient, bed, ward: name } = await ward();
    const spare = await createBed({ ward: name });

    expectOk(await assign(bed, patient, nurse));
    const res = await assign(spare, patient, nurse);

    expectError(res, 409, 'ALREADY_ADMITTED');
    // Crucially the *second* bed was never claimed — an early return, not a
    // rollback we would have to trust.
    expect(await Bed.findById(spare._id)).toMatchObject({ status: BED_STATUS.AVAILABLE });
  });

  it('404s for an unknown patient and 422s for an unusable id', async () => {
    const { nurse, bed } = await ward();
    const ghost = await createActor(ROLES.PATIENT);
    await Patient.deleteOne({ _id: ghost.profile._id });

    expectError(await assign(bed, ghost, nurse), 404, 'NOT_FOUND');
    expectError(
      await api().post(url(`/beds/${bed._id}/assign`)).set(nurse.headers).send({ patientId: 'nope' }),
      422,
      'VALIDATION_ERROR'
    );
  });
});

describe('beds — housekeeping status', () => {
  it('moves a cleaned bed back into service', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const bed = await createBed({ status: BED_STATUS.CLEANING });

    const body = expectOk(
      await api()
        .patch(url(`/beds/${bed._id}/status`))
        .set(nurse.headers)
        .send({ status: BED_STATUS.AVAILABLE })
    );
    expect(body.status).toBe(BED_STATUS.AVAILABLE);
  });

  it('refuses `occupied` at both the validator and the service', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const bed = await createBed();

    // The router rejects it first, naming the statuses housekeeping may set.
    expectError(
      await api()
        .patch(url(`/beds/${bed._id}/status`))
        .set(nurse.headers)
        .send({ status: BED_STATUS.OCCUPIED }),
      422,
      'VALIDATION_ERROR'
    );

    // And the service refuses independently, so occupancy cannot be forged by a
    // caller that never passes through this route — a socket handler, a script.
    await expect(bedService.setStatus(bed._id, BED_STATUS.OCCUPIED)).rejects.toMatchObject({
      statusCode: 400,
      code: 'USE_ASSIGN',
    });
    expect(await Bed.findById(bed._id)).toMatchObject({ status: BED_STATUS.AVAILABLE });
  });

  it('refuses to change the status of a bed with a patient in it', async () => {
    const { nurse, patient, bed } = await ward();
    expectOk(await assign(bed, patient, nurse));

    expectError(
      await api()
        .patch(url(`/beds/${bed._id}/status`))
        .set(nurse.headers)
        .send({ status: BED_STATUS.MAINTENANCE }),
      409
    );
    // Had this succeeded the patient would still believe they were in the bed.
    expect(await Bed.findById(bed._id)).toMatchObject({ status: BED_STATUS.OCCUPIED });
  });
});

describe('beds — release', () => {
  it('sends a vacated bed to cleaning, never straight back to available', async () => {
    const { nurse, patient, bed } = await ward();
    expectOk(await assign(bed, patient, nurse));

    const body = expectOk(
      await api()
        .post(url('/beds/release'))
        .set(nurse.headers)
        .send({ patientId: String(patient.profile._id) })
    );

    // A bed that has just been used is not ready for the next patient.
    expect(body.status).toBe(BED_STATUS.CLEANING);
    expect(body.patient).toBeNull();

    const stored = await Patient.findById(patient.profile._id);
    expect(stored.bed).toBeUndefined();

    // And it is genuinely out of the pool until housekeeping says otherwise.
    const free = expectOk(await api().get(url('/beds/available')).set(nurse.headers));
    expect(free.map((b) => b.id)).not.toContain(String(bed._id));
  });

  it('refuses to release a patient who is not in a bed', async () => {
    const { nurse, patient } = await ward();

    expectError(
      await api()
        .post(url('/beds/release'))
        .set(nurse.headers)
        .send({ patientId: String(patient.profile._id) }),
      400
    );
  });
});

describe('beds — transfer', () => {
  it('moves the patient and follows them with the ward', async () => {
    const { nurse, patient, bed } = await ward();
    const target = await createBed({ ward: 'Maternity', type: 'general' });
    expectOk(await assign(bed, patient, nurse));

    const body = expectOk(
      await api()
        .post(url(`/beds/${target._id}/transfer`))
        .set(nurse.headers)
        .send({ patientId: String(patient.profile._id) })
    );
    expect(String(body._id || body.id)).toBe(String(target._id));

    expect(await Bed.findById(target._id)).toMatchObject({ status: BED_STATUS.OCCUPIED });
    // The vacated bed goes through cleaning like any other.
    expect(await Bed.findById(bed._id)).toMatchObject({ status: BED_STATUS.CLEANING });

    // The denormalised ward has to follow, or the patient stays authorised to the
    // nurses of a ward they have left.
    const stored = await Patient.findById(patient.profile._id);
    expect(String(stored.bed)).toBe(String(target._id));
    expect(stored.ward).toBe('Maternity');
  });

  it('leaves the patient where they were when the target is taken', async () => {
    const { nurse, patient, bed, ward: name } = await ward();
    const other = await createAdmittedPatient({ nurses: [nurse], ward: name });
    const target = await createBed({ ward: name });

    expectOk(await assign(bed, patient, nurse));
    expectOk(await assign(target, other, nurse));

    const res = await api()
      .post(url(`/beds/${target._id}/transfer`))
      .set(nurse.headers)
      .send({ patientId: String(patient.profile._id) });
    expectError(res, 409, 'BED_TAKEN');

    // Claim-then-release, in that order: a failed transfer must not leave the
    // patient with no bed at all.
    const stored = await Patient.findById(patient.profile._id);
    expect(String(stored.bed)).toBe(String(bed._id));
    expect(await Bed.findById(bed._id)).toMatchObject({ status: BED_STATUS.OCCUPIED });
    expect(String((await Bed.findById(target._id)).patient)).toBe(String(other.profile._id));
  });

  it('refuses a transfer into the bed the patient is already in', async () => {
    const { nurse, patient, bed } = await ward();
    expectOk(await assign(bed, patient, nurse));

    expectError(
      await api()
        .post(url(`/beds/${bed._id}/transfer`))
        .set(nurse.headers)
        .send({ patientId: String(patient.profile._id) }),
      400
    );
    expect(await Bed.findById(bed._id)).toMatchObject({ status: BED_STATUS.OCCUPIED });
  });

  it('refuses to transfer a patient who is not admitted', async () => {
    const { nurse, patient, bed } = await ward();

    expectError(
      await api()
        .post(url(`/beds/${bed._id}/transfer`))
        .set(nurse.headers)
        .send({ patientId: String(patient.profile._id) }),
      400
    );
  });
});

describe('beds — the ward board', () => {
  it('reports occupancy per ward without disguising a ward name as an id', async () => {
    const { admin, nurse, patient, bed } = await ward();
    await createBed({ ward: 'ICU' });
    await createBed({ ward: 'Maternity' });
    expectOk(await assign(bed, patient, nurse));

    const board = expectOk(await api().get(url('/beds/occupancy')).set(admin.headers));
    const icu = board.find((row) => row.ward === 'ICU');

    expect(icu.total).toBe(2);
    expect(icu.byStatus).toEqual(
      expect.arrayContaining([
        { status: BED_STATUS.OCCUPIED, count: 1 },
        { status: BED_STATUS.AVAILABLE, count: 1 },
      ])
    );
    // The grouping key is a ward name. Shipping it as `_id` — which the response
    // serialiser would then rename to `id` — makes it look like a document id to
    // every client that reads one.
    expect(icu.id).toBeUndefined();
    expect(board.map((row) => row.ward).sort()).toEqual(['ICU', 'Maternity']);
  });

  it('lists free beds only, filtered by ward', async () => {
    const { nurse, patient, bed, ward: name } = await ward();
    const free = await createBed({ ward: name });
    await createBed({ ward: 'Maternity' });
    expectOk(await assign(bed, patient, nurse));

    const available = expectOk(
      await api().get(url('/beds/available')).query({ ward: name }).set(nurse.headers)
    );

    expect(available.map((b) => b.id)).toEqual([String(free._id)]);
  });

  it('lists the wards that actually have beds', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createBed({ ward: 'ICU' });
    await createBed({ ward: 'ICU' });
    await createBed({ ward: 'Maternity' });

    const wards = expectOk(await api().get(url('/beds/wards')).set(admin.headers));
    expect(wards.sort()).toEqual(['ICU', 'Maternity']);
  });
});
