'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const {
  createActor,
  createAdmittedPatient,
  createBed,
  createPatientProfile,
  createUser,
} = require('../helpers/factories');
const { Patient, Bed, Notification } = require('../../src/models');
const { ROLES, BED_STATUS } = require('../../src/utils/constants');

/**
 * Patients: the record itself, and the three separate questions of who may read
 * it, who may change the chart, and who may change the care team.
 *
 * The requirement being held in place is *"only hospital staff, nurses and
 * doctors see the infos and then can do treatment from there"*, and the reason
 * this file is long is that "who may" has three different answers depending on
 * which part of the record is being touched:
 *
 * **Demographics are wide.** Any employee may look a patient up — a receptionist
 * who cannot find a patient cannot book them an appointment. So the directory is
 * `requireStaff`, not `requireCareWrite`, and the tests below assert a
 * receptionist succeeds where a patient is refused.
 *
 * **The chart is narrow, and narrow in a specific shape.** Writing to it needs
 * the care team *or* a nurse whose ward covers the patient — the second clause
 * exists so the nurse who actually gave the dose can chart it when the roster has
 * not caught up. That is four distinct paths to a 200 (assigned nurse, covering
 * nurse, float nurse, admin) and they are tested separately, because collapsing
 * them into one "a nurse can edit" test would pass against an implementation that
 * let *every* nurse edit *every* patient.
 *
 * **A patient is not a clinician on their own record.** The split between
 * `updateOwn` and `updateClinical` is the whole point of having two endpoints: a
 * patient may correct their address and may not delete an allergy. Zod strips the
 * clinical keys before the service ever sees them, so the assertion is that a
 * patch of *only* forbidden fields is a 422 and a mixed patch silently drops
 * them — not that the service politely refuses.
 *
 * **Care-team composition is deliberately not behind care-team membership.** The
 * doctor arranging cover is frequently not yet on the team, and requiring
 * membership to grant membership deadlocks. It is a doctor/admin decision, which
 * is why a nurse — who *can* chart — cannot assign.
 */

const MISSING_ID = '507f1f77bcf86cd799439011';

/** A ward built the way the authorisation rules expect to find one. */
async function bedside({ ward = 'ICU' } = {}) {
  const doctor = await createActor(ROLES.DOCTOR);
  const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: [ward] } });
  const patient = await createAdmittedPatient({ doctor, nurses: [nurse], ward });
  return { doctor, nurse, patient, ward };
}

const chart = (patient, actor, body) =>
  api()
    .patch(url(`/patients/${patient.profile._id}/clinical`))
    .set(actor.headers)
    .send(body);

const stored = (patient) => Patient.findById(patient.profile._id).lean();

describe('patients — a patient sees their own record and nobody else’s', () => {
  it('returns the record belonging to the logged-in patient', async () => {
    const patient = await createActor(ROLES.PATIENT);

    const res = await api().get(url('/patients/me')).set(patient.headers);
    const body = expectOk(res);

    expect(body.id).toBe(String(patient.profile._id));
    expect(body.medicalRecordNumber).toMatch(/^MRN-/);
  });

  it('tells an employee they have no patient record rather than inventing one', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await api().get(url('/patients/me')).set(receptionist.headers);

    expect(expectError(res, 404, 'NOT_FOUND').message).toMatch(/patient profile not found/i);
  });

  it('refuses an anonymous caller', async () => {
    const res = await api().get(url('/patients/me'));
    expectError(res, 401, 'TOKEN_MISSING');
  });

  it('lets a patient correct the details that are theirs to correct', async () => {
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .patch(url('/patients/me'))
      .set(patient.headers)
      .send({
        address: '14 Hill Road, Springfield',
        emergencyContact: { name: 'Ada Kin', relationship: 'sister', phone: '+15550002222' },
      });
    const body = expectOk(res);

    expect(body.address).toBe('14 Hill Road, Springfield');
    expect(body.emergencyContact.name).toBe('Ada Kin');
  });

  it('rejects a self-patch that contains only clinical fields', async () => {
    const patient = await createActor(ROLES.PATIENT, { profile: { allergies: ['penicillin'] } });

    // Zod strips `allergies` and `bloodGroup` — they are not in `updateOwn` — and
    // what is left is `{}`, which `nonEmptyPatch` refuses. A patient editing
    // their own allergy list must fail loudly, not quietly do nothing.
    const res = await api()
      .patch(url('/patients/me'))
      .set(patient.headers)
      .send({ allergies: [], bloodGroup: 'O+' });

    expectError(res, 422, 'VALIDATION_ERROR');
    expect((await stored(patient)).allergies).toEqual(['penicillin']);
  });

  it('drops clinical fields smuggled alongside a legitimate one', async () => {
    const patient = await createActor(ROLES.PATIENT, { profile: { allergies: ['penicillin'] } });

    const res = await api()
      .patch(url('/patients/me'))
      .set(patient.headers)
      .send({ address: 'New address', allergies: [] });
    expectOk(res);

    const after = await stored(patient);
    expect(after.address).toBe('New address');
    expect(after.allergies).toEqual(['penicillin']);
  });

  it('404s a patient whose account has no profile document', async () => {
    const orphan = await createUser({ role: ROLES.PATIENT });
    const { accessToken } = require('../../src/services/tokenService').issueTokens(orphan);

    const res = await api()
      .patch(url('/patients/me'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ address: 'Nowhere' });

    expectError(res, 404, 'NOT_FOUND');
  });
});

describe('patients — the directory is staff-only', () => {
  it('refuses a patient the run of the register', async () => {
    const patient = await createActor(ROLES.PATIENT);

    const res = await api().get(url('/patients')).set(patient.headers);
    expectError(res, 403, 'FORBIDDEN');
  });

  it('lists patients for a receptionist, with pagination metadata', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    await createActor(ROLES.PATIENT);
    await createActor(ROLES.PATIENT);

    const res = await api().get(url('/patients?limit=1')).set(receptionist.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(res.body.meta.pagination).toMatchObject({
      total: 2,
      page: 1,
      limit: 1,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it('searches by medical record number', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const wanted = await createActor(ROLES.PATIENT);
    await createActor(ROLES.PATIENT);

    const res = await api()
      .get(url(`/patients?search=${wanted.profile.medicalRecordNumber}`))
      .set(receptionist.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(String(wanted.profile._id));
  });

  it('searches by ward', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    await createAdmittedPatient({ ward: 'CARDIOLOGY' });
    await createAdmittedPatient({ ward: 'ICU' });

    const res = await api().get(url('/patients?search=cardio')).set(receptionist.headers);

    expect(expectOk(res)).toHaveLength(1);
  });

  it('does not search by patient name', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    await createActor(ROLES.PATIENT, { user: { name: 'Zebedee Quillfeather' } });

    // Documenting the boundary rather than asserting a wish: the search index is
    // `medicalRecordNumber` and `ward`, both of which live on the patient
    // document. Name lives on the user account, and matching it would mean a
    // second collection scan on every keystroke at the front desk.
    const res = await api().get(url('/patients?search=Zebedee')).set(receptionist.headers);

    expect(expectOk(res)).toHaveLength(0);
  });

  it('filters by ward and admission state together', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    await createAdmittedPatient({ ward: 'ICU' });
    const goneHome = await createAdmittedPatient({ ward: 'ICU' });
    await goneHome.profile.updateOne({ isAdmitted: false });
    await createAdmittedPatient({ ward: 'ER' });

    const admitted = await api()
      .get(url('/patients?ward=ICU&isAdmitted=true'))
      .set(receptionist.headers);
    expect(expectOk(admitted)).toHaveLength(1);

    const discharged = await api()
      .get(url('/patients?ward=ICU&isAdmitted=false'))
      .set(receptionist.headers);
    const items = expectOk(discharged);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(String(goneHome.profile._id));
  });

  it('rejects a filter value outside the allowed set', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await api().get(url('/patients?bloodGroup=Z%2B')).set(receptionist.headers);
    expectError(res, 422, 'VALIDATION_ERROR');
  });

  it('shows a ward census of admitted patients only', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const inWard = await createAdmittedPatient({ ward: 'ICU' });
    const goneHome = await createAdmittedPatient({ ward: 'ICU' });
    await goneHome.profile.updateOne({ isAdmitted: false });

    const res = await api().get(url('/patients/ward/ICU')).set(nurse.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(String(inWard.profile._id));
  });

  it('looks a patient up by record number, and 404s an unknown one', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const patient = await createActor(ROLES.PATIENT);

    const found = await api()
      .get(url(`/patients/mrn/${patient.profile.medicalRecordNumber.toLowerCase()}`))
      .set(receptionist.headers);
    expect(expectOk(found).id).toBe(String(patient.profile._id));

    const missing = await api().get(url('/patients/mrn/MRN-NOPE-0000')).set(receptionist.headers);
    expectError(missing, 404, 'NOT_FOUND');
  });
});

describe('patients — a nurse’s caseload is their own', () => {
  it('returns only the admitted patients assigned to the calling nurse', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const other = await createActor(ROLES.NURSE);

    const mine = await createAdmittedPatient({ nurses: [nurse] });
    const theirs = await createAdmittedPatient({ nurses: [other] });
    const dischargedMine = await createAdmittedPatient({ nurses: [nurse] });
    await dischargedMine.profile.updateOne({ isAdmitted: false });

    const res = await api().get(url('/patients/caseload')).set(nurse.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(String(mine.profile._id));
    expect(items.map((p) => p.id)).not.toContain(String(theirs.profile._id));
  });

  it('is a nursing screen, so a doctor has no caseload here', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api().get(url('/patients/caseload')).set(doctor.headers);
    expectError(res, 403, 'FORBIDDEN');
  });
});

describe('patients — reading one record by id', () => {
  it('gives staff the record with the linked account populated', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    const patient = await createActor(ROLES.PATIENT, { user: { name: 'Marta Vega' } });

    const res = await api()
      .get(url(`/patients/${patient.profile._id}`))
      .set(receptionist.headers);
    const body = expectOk(res);

    expect(body.user.name).toBe('Marta Vega');
    // The populated projection is deliberate: a directory read must not carry
    // the password hash or the token epoch out with it.
    expect(body.user.password).toBeUndefined();
  });

  it('ignores the id in the path when the caller is a patient', async () => {
    const caller = await createActor(ROLES.PATIENT);
    const someoneElse = await createActor(ROLES.PATIENT);

    const res = await api()
      .get(url(`/patients/${someoneElse.profile._id}`))
      .set(caller.headers);

    // Not a 403: the endpoint means "the patient this request is about", and for
    // a patient that is always themselves. Guessing an id gets you your own
    // chart, so id enumeration reveals nothing.
    expect(expectOk(res).id).toBe(String(caller.profile._id));
  });

  it('404s an id that belongs to nobody', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await api().get(url(`/patients/${MISSING_ID}`)).set(receptionist.headers);
    expectError(res, 404, 'NOT_FOUND');
  });

  it('422s an id that is not an id', async () => {
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await api().get(url('/patients/not-an-id')).set(receptionist.headers);
    expectError(res, 422, 'VALIDATION_ERROR');
  });
});

describe('patients — charting is for the care team and the ward', () => {
  it('lets the assigned nurse update the chart', async () => {
    const { nurse, patient } = await bedside();

    const res = await chart(patient, nurse, { allergies: ['latex'], bloodGroup: 'O+' });
    const body = expectOk(res);

    expect(body.allergies).toEqual(['latex']);
    expect((await stored(patient)).bloodGroup).toBe('O+');
  });

  it('lets the primary doctor update the chart', async () => {
    const { doctor, patient } = await bedside();

    const res = await chart(patient, doctor, { chronicConditions: ['asthma'] });
    expect(expectOk(res).chronicConditions).toEqual(['asthma']);
  });

  it('lets a nurse whose ward covers the patient chart without being assigned', async () => {
    const patient = await createAdmittedPatient({ ward: 'ICU' });
    const covering = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });

    // The bedside reality this clause exists for: the dose was given, the roster
    // had not caught up, and the alternative to allowing this write is an
    // unrecorded administration.
    const res = await chart(patient, covering, { medicalHistory: 'Given 5mg at 03:10' });
    expect(expectOk(res).medicalHistory).toBe('Given 5mg at 03:10');
  });

  it('lets a float nurse with no ward restriction chart anywhere', async () => {
    const patient = await createAdmittedPatient({ ward: 'ICU' });
    const float = await createActor(ROLES.NURSE, { profile: { assignedWards: [] } });

    const res = await chart(patient, float, { age: 51 });
    expect(expectOk(res).age).toBe(51);
  });

  it('refuses a nurse rostered to a different ward and not on the team', async () => {
    const patient = await createAdmittedPatient({ ward: 'ICU' });
    const elsewhere = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ER'] } });

    const res = await chart(patient, elsewhere, { allergies: ['latex'] });

    expect(expectError(res, 403, 'FORBIDDEN').message).toMatch(/care team/i);
    expect((await stored(patient)).allergies).toEqual([]);
  });

  it('refuses a doctor who is not this patient’s doctor', async () => {
    const { patient } = await bedside();
    const stranger = await createActor(ROLES.DOCTOR);

    const res = await chart(patient, stranger, { allergies: ['latex'] });
    expectError(res, 403, 'FORBIDDEN');
  });

  it('refuses a receptionist, who is staff but not clinical', async () => {
    const { patient } = await bedside();
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const res = await chart(patient, receptionist, { bloodGroup: 'A-' });
    expectError(res, 403, 'FORBIDDEN');
  });

  it('refuses the patient editing their own chart through the clinical route', async () => {
    const { patient } = await bedside();

    // `me` resolves to their own record, so this is the closest a patient can get
    // to their own allergy list. It is still a 403 — the record is theirs, the
    // chart is not.
    const res = await api()
      .patch(url('/patients/me/clinical'))
      .set(patient.headers)
      .send({ allergies: [] });

    expectError(res, 403, 'FORBIDDEN');
  });

  it('lets an administrator chart without being on any team', async () => {
    const { patient } = await bedside();
    const admin = await createActor(ROLES.ADMIN);

    const res = await chart(patient, admin, { gender: 'female' });
    expect(expectOk(res).gender).toBe('female');
  });

  it('rejects an empty patch and a patch of fields nobody may set here', async () => {
    const { nurse, patient } = await bedside();

    expectError(await chart(patient, nurse, {}), 422, 'VALIDATION_ERROR');
    // `ward` and `isAdmitted` are bed-service business; they are stripped by the
    // schema, leaving nothing, so the request fails rather than half-applying.
    expectError(
      await chart(patient, nurse, { ward: 'ER', isAdmitted: false }),
      422,
      'VALIDATION_ERROR'
    );
    expect((await stored(patient)).ward).toBe('ICU');
  });

  it('404s a chart edit against a patient who does not exist', async () => {
    const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: [] } });

    const res = await api()
      .patch(url(`/patients/${MISSING_ID}/clinical`))
      .set(nurse.headers)
      .send({ allergies: ['latex'] });

    expectError(res, 404, 'NOT_FOUND');
  });
});

describe('patients — composing the care team', () => {
  it('lets a doctor assign nurses, idempotently, and tells them', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE);
    const patient = await createAdmittedPatient({ doctor });

    const assign = () =>
      api()
        .post(url(`/patients/${patient.profile._id}/nurses`))
        .set(doctor.headers)
        .send({ nurseUserIds: [String(nurse.user._id)] });

    expectOk(await assign());
    // `$addToSet`, so a double-submit from a flaky connection cannot duplicate a
    // care-team member — which would then be paged twice for every alert.
    const second = expectOk(await assign());

    expect(second.assignedNurses.map(String)).toEqual([String(nurse.user._id)]);

    const notice = await Notification.findOne({ recipient: nurse.user._id }).lean();
    expect(notice.title).toBe('New patient assigned');
    expect(notice.data.patientId).toBe(String(patient.profile._id));
  });

  it('refuses an id that is not an active nurse', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const impostor = await createActor(ROLES.DOCTOR);
    const retired = await createActor(ROLES.NURSE, { profile: { isActive: false } });
    const patient = await createAdmittedPatient({ doctor });

    const send = (id) =>
      api()
        .post(url(`/patients/${patient.profile._id}/nurses`))
        .set(doctor.headers)
        .send({ nurseUserIds: [String(id)] });

    // Both matter: `$addToSet` would happily store either, and the care-team
    // check would then grant or withhold bedside access based on garbage.
    expect(expectError(await send(impostor.user._id), 400).message).toMatch(/active nurse/i);
    expectError(await send(retired.user._id), 400);

    expect((await stored(patient)).assignedNurses).toEqual([]);
  });

  it('rejects the whole batch when one id is bad', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const good = await createActor(ROLES.NURSE);
    const patient = await createAdmittedPatient({ doctor });

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/nurses`))
      .set(doctor.headers)
      .send({ nurseUserIds: [String(good.user._id), MISSING_ID] });

    expectError(res, 400);
    // All-or-nothing: a partially applied team is worse than a rejected one,
    // because nobody is told which half landed.
    expect((await stored(patient)).assignedNurses).toEqual([]);
  });

  it('does not let a nurse compose the team they are part of', async () => {
    const { nurse, patient } = await bedside();
    const colleague = await createActor(ROLES.NURSE);

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/nurses`))
      .set(nurse.headers)
      .send({ nurseUserIds: [String(colleague.user._id)] });

    expectError(res, 403, 'FORBIDDEN');
  });

  it('removes a nurse from the team', async () => {
    const { doctor, nurse, patient } = await bedside();

    const res = await api()
      .delete(url(`/patients/${patient.profile._id}/nurses/${nurse.user._id}`))
      .set(doctor.headers);
    expect(expectOk(res).assignedNurses).toEqual([]);

    // And the removed nurse loses bedside authority with it — unless her ward
    // still covers the patient, which is why she is rostered elsewhere here.
    await nurse.profile.updateOne({ assignedWards: ['ER'] });
    expectError(await chart(patient, nurse, { allergies: ['latex'] }), 403, 'FORBIDDEN');
  });

  it('sets the primary doctor, refusing anyone who is not an active doctor', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);
    const newDoctor = await createActor(ROLES.DOCTOR);
    const patient = await createAdmittedPatient({});

    const send = (id) =>
      api()
        .patch(url(`/patients/${patient.profile._id}/primary-doctor`))
        .set(admin.headers)
        .send({ doctorUserId: String(id) });

    expect(expectError(await send(nurse.user._id), 400).message).toMatch(/active doctor/i);

    const res = await send(newDoctor.user._id);
    expect(String(expectOk(res).primaryDoctor)).toBe(String(newDoctor.user._id));

    // The new doctor inherits the chart with the assignment, not by a separate grant.
    expect(expectOk(await chart(patient, newDoctor, { bloodGroup: 'B+' })).bloodGroup).toBe('B+');
  });

  it('reports the care team as the ids that authorise bedside work', async () => {
    const { doctor, nurse, patient } = await bedside();

    const res = await api()
      .get(url(`/patients/${patient.profile._id}/care-team`))
      .set(doctor.headers);
    const team = expectOk(res);

    expect(team.patientUserId).toBe(String(patient.user._id));
    expect(team.clinicianUserIds.sort()).toEqual(
      [String(doctor.user._id), String(nurse.user._id)].sort()
    );
  });
});

describe('patients — discharge closes the stay and frees the bed', () => {
  /** An admitted patient actually holding a bed, as `bedService.assign` leaves them. */
  async function admittedInABed({ ward = 'ICU' } = {}) {
    const doctor = await createActor(ROLES.DOCTOR);
    const bed = await createBed({ ward });
    const patient = await createAdmittedPatient({ doctor, ward, bed });
    await bed.updateOne({ status: BED_STATUS.OCCUPIED, patient: patient.profile._id });
    return { doctor, bed, patient };
  }

  it('releases the bed, closes the stay and files the summary', async () => {
    const { doctor, bed, patient } = await admittedInABed();

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/discharge`))
      .set(doctor.headers)
      .send({ summary: 'Stable on discharge; review in two weeks.' });
    const body = expectOk(res);

    expect(body.isAdmitted).toBe(false);
    expect(body.dischargedAt).toBeDefined();
    expect(body.medicalHistory).toBe('Stable on discharge; review in two weeks.');
    expect(body.bed).toBeUndefined();

    // Both documents, not just the response. A bed left marked `occupied` by a
    // patient who has gone home is a bed the ward can never use again, and
    // `release` refuses to run once the pointer is gone.
    const freed = await Bed.findById(bed._id).lean();
    expect(freed.status).toBe(BED_STATUS.CLEANING);
    expect(freed.patient).toBeNull();
    expect((await stored(patient)).bed).toBeUndefined();
  });

  it('discharges an outpatient who never held a bed', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);

    // "Nothing to release" is not a failure. Letting `bedService`'s 400 escape
    // here would leave the stay permanently open for every outpatient.
    const res = await api()
      .post(url(`/patients/${patient.profile._id}/discharge`))
      .set(doctor.headers)
      .send({});

    expect(expectOk(res).isAdmitted).toBe(false);
  });

  it('discharges past a stale bed pointer instead of stranding the patient', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const bed = await createBed();
    const someoneElse = await createActor(ROLES.PATIENT);
    const patient = await createAdmittedPatient({ doctor, bed });
    await bed.updateOne({ status: BED_STATUS.OCCUPIED, patient: someoneElse.profile._id });

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/discharge`))
      .set(doctor.headers)
      .send({});
    expect(expectOk(res).isAdmitted).toBe(false);

    // The bed belongs to its real occupant and is left exactly as it was.
    const untouched = await Bed.findById(bed._id).lean();
    expect(untouched.status).toBe(BED_STATUS.OCCUPIED);
    expect(String(untouched.patient)).toBe(String(someoneElse.profile._id));
  });

  it('is a doctor or administrator decision, not a nursing one', async () => {
    const { patient } = await bedside();
    const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/discharge`))
      .set(nurse.headers)
      .send({});

    expectError(res, 403, 'FORBIDDEN');
    expect((await stored(patient)).isAdmitted).toBe(true);
  });

  it('does not let a patient discharge themselves', async () => {
    const patient = await createActor(ROLES.PATIENT, { profile: { isAdmitted: true } });

    const res = await api()
      .post(url(`/patients/${patient.profile._id}/discharge`))
      .set(patient.headers)
      .send({});

    expectError(res, 403, 'FORBIDDEN');
  });

  it('404s a discharge against an unknown patient', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .post(url(`/patients/${MISSING_ID}/discharge`))
      .set(doctor.headers)
      .send({});

    expectError(res, 404, 'NOT_FOUND');
  });
});

describe('patients — profiles are one to one with accounts', () => {
  it('refuses a second patient profile for the same account', async () => {
    const patient = await createActor(ROLES.PATIENT);

    // The unique index on `user` is the only thing standing between a duplicated
    // registration and a patient with two charts, half a history in each.
    await expect(createPatientProfile(patient.user)).rejects.toThrow(/duplicate key/i);
  });
});
