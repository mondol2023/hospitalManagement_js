'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient, ensureDepartment } = require('../helpers/factories');
const { Conversation, Patient, Notification } = require('../../src/models');
const { ROLES, CONVERSATION_TYPE, NOTIFICATION_TYPE } = require('../../src/utils/constants');

/**
 * Messaging: two channels, and the wall between them.
 *
 * The requirement is stated as two options — one thread for the patient with
 * their nurse and doctor, one for hospital staff only — and the interesting half
 * is the word *only*. A ward handover that says "family is asking about
 * prognosis, don't discuss it yet" is a clinical necessity and a catastrophe if
 * it lands in the patient's inbox. So this file spends far more of its time
 * proving the staff channel is invisible than proving the care channel works.
 *
 * Three properties are worth naming, because each is a place the feature could
 * pass a casual test and still be wrong:
 *
 * **The wall is one rule, not a route decoration.** `canJoinConversation` is
 * checked at creation, at every membership change, and on every read — the
 * socket gateway calls the same service methods without passing through any
 * middleware, so a router-only guard would be a wall with a door in the back.
 * The tests therefore attack the service's answers, not the router's.
 *
 * **A refusal must not be an oracle.** A patient who names a staff thread's id
 * gets 404, not 403, so nobody can walk the id space learning which
 * conversations exist. That distinction is asserted explicitly; a suite that
 * accepted "any 4xx" would let the leak back in.
 *
 * **Membership is derived, never supplied.** A care-team channel's participants
 * come from the care team, so there is no request shape that puts an unrelated
 * account in a patient's thread — and a clinician assigned after the thread
 * opened has to be folded in, or the roster and the channel drift apart.
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

/** A patient with a doctor and a nurse on their care team. */
async function careTeam() {
  const doctor = await createActor(ROLES.DOCTOR);
  const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });
  const patient = await createAdmittedPatient({ doctor, nurses: [nurse] });
  return { doctor, nurse, patient };
}

const openCareTeam = (patient, actor) =>
  api().post(url(`/chat/care-team/${patient.profile._id}`)).set(actor.headers);

const openStaff = (actor, others, extra = {}) =>
  api()
    .post(url('/chat/staff'))
    .set(actor.headers)
    .send({ participantIds: others.map((other) => String(other.user._id)), ...extra });

const say = (conversationId, actor, body) =>
  api().post(url(`/chat/${conversationId}/messages`)).set(actor.headers).send({ body });

const historyOf = (conversationId, actor) =>
  api().get(url(`/chat/${conversationId}/messages`)).set(actor.headers);

describe('chat — the care-team channel', () => {
  it('opens a channel holding the patient and their clinicians', async () => {
    const { doctor, nurse, patient } = await careTeam();

    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    expect(conversation.type).toBe(CONVERSATION_TYPE.CARE_TEAM);
    expect(String(conversation.patient)).toBe(String(patient.profile._id));
    // Derived from the care team, not from the request body — the endpoint takes
    // no participant list at all.
    expect(conversation.participants.map(String).sort()).toEqual(
      [patient.user._id, doctor.user._id, nurse.user._id].map(String).sort()
    );
  });

  it('lets the patient and their clinician talk in it', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    expectOk(await say(conversation.id, doctor, 'Your results are back — all clear.'), 201);
    expectOk(await say(conversation.id, patient, 'Thank you, doctor.'), 201);

    const history = expectOk(await historyOf(conversation.id, patient));
    expect(history).toHaveLength(2);
    // Newest first: the client renders from the bottom of the thread upwards.
    expect(history[0].body).toBe('Thank you, doctor.');
    expect(history[0].sender.role).toBe(ROLES.PATIENT);
    expect(history[1].body).toBe('Your results are back — all clear.');
  });

  it('refuses a doctor who is not on this patient’s care team', async () => {
    const { patient } = await careTeam();
    const stranger = await createActor(ROLES.DOCTOR);

    expectError(await openCareTeam(patient, stranger), 403, 'FORBIDDEN');
    expect(await Conversation.countDocuments({ patient: patient.profile._id })).toBe(0);
  });

  it('is created once, however many people open it', async () => {
    const { doctor, patient } = await careTeam();

    const first = expectOk(await openCareTeam(patient, doctor), 201);
    const second = expectOk(await openCareTeam(patient, patient), 201);

    // Find-or-create: opening an existing channel is not an error, and must not
    // leave the patient with two threads that each hold half the history.
    expect(second.id).toBe(first.id);
    expect(await Conversation.countDocuments({ patient: patient.profile._id })).toBe(1);
  });

  it('folds in a nurse assigned after the channel already existed', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createAdmittedPatient({ doctor });
    const opened = expectOk(await openCareTeam(patient, doctor), 201);
    expect(opened.participants).toHaveLength(2);

    const nurse = await createActor(ROLES.NURSE);
    await Patient.updateOne(
      { _id: patient.profile._id },
      { $addToSet: { assignedNurses: nurse.user._id } }
    );

    const joined = expectOk(await openCareTeam(patient, nurse), 201);

    expect(joined.id).toBe(opened.id);
    expect(joined.participants.map(String)).toContain(String(nurse.user._id));
  });

  it('refuses to open a channel for a patient with no care team', async () => {
    const patient = await createAdmittedPatient({});
    const admin = await createActor(ROLES.ADMIN);

    // A channel called "care team" with nobody clinical in it is worse than no
    // channel: the patient would message it and nobody would ever answer.
    expectError(await openCareTeam(patient, admin), 400, 'NO_CARE_TEAM');
  });
});

describe('chat — the staff-only channel', () => {
  it('opens a thread between employees', async () => {
    await ensureDepartment('ICU');
    const nurse = await createActor(ROLES.NURSE);
    const doctor = await createActor(ROLES.DOCTOR);
    const receptionist = await createActor(ROLES.RECEPTIONIST);

    const conversation = expectOk(
      await openStaff(nurse, [doctor, receptionist], { title: 'ICU handover', department: 'ICU' }),
      201
    );

    expect(conversation.type).toBe(CONVERSATION_TYPE.STAFF_ONLY);
    expect(conversation.title).toBe('ICU handover');
    expect(conversation.patient).toBeNull();
    expect(conversation.participants).toHaveLength(3);
  });

  it('rejects a patient in the participant list rather than quietly dropping them', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/chat/staff'))
      .set(nurse.headers)
      .send({
        title: 'ICU handover',
        participantIds: [String(doctor.user._id), String(patient.user._id)],
      });

    expectError(res, 403, 'PATIENT_NOT_ALLOWED');
    // Silently removing them would leave the nurse believing the patient is in a
    // thread they cannot see, which is the more dangerous half of the mistake.
    expect(await Conversation.countDocuments({})).toBe(0);
  });

  it('is closed to patients at the door', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await createActor(ROLES.DOCTOR);

    expectError(await openStaff(patient, [doctor]), 403, 'FORBIDDEN');
  });

  it('refuses to have a patient added to it later', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const conversation = expectOk(await openStaff(nurse, [doctor]), 201);

    const res = await api()
      .post(url(`/chat/${conversation.id}/participants`))
      .set(nurse.headers)
      .send({ userId: String(patient.user._id) });

    // The same rule as creation, applied at the other door into the room.
    expectError(res, 403, 'ROLE_NOT_ALLOWED');
  });
});

describe('chat — the wall between the two channels', () => {
  it('keeps the staff thread out of the patient’s inbox', async () => {
    const { doctor, nurse, patient } = await careTeam();
    const care = expectOk(await openCareTeam(patient, doctor), 201);
    const staff = expectOk(await openStaff(doctor, [nurse], { title: 'Do not discuss yet' }), 201);
    expectOk(await say(staff.id, doctor, 'Hold the prognosis conversation until Friday.'), 201);

    const inbox = expectOk(await api().get(url('/chat')).set(patient.headers));

    expect(inbox.map((thread) => thread.id)).toEqual([care.id]);
    expect(inbox.every((thread) => thread.type === CONVERSATION_TYPE.CARE_TEAM)).toBe(true);
  });

  it('answers 404, not 403, when a patient names a staff thread directly', async () => {
    const { doctor, nurse, patient } = await careTeam();
    const staff = expectOk(await openStaff(doctor, [nurse]), 201);

    const res = await api().get(url(`/chat/${staff.id}`)).set(patient.headers);

    // 403 would confirm the id is real. A non-member gets the same answer for a
    // thread that exists and one that never did.
    expectError(res, 404, 'NOT_FOUND');
  });
});

describe('chat — direct messages', () => {
  it('reuses one thread between the same two colleagues', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE);
    const direct = (actor, other) =>
      api().post(url('/chat/direct')).set(actor.headers).send({ userId: String(other.user._id) });

    const opened = expectOk(await direct(doctor, nurse), 201);
    const reopened = expectOk(await direct(nurse, doctor), 201);

    // The key is a sorted pair, so it is the same thread from either side —
    // otherwise every click of "message" would start a fresh empty conversation.
    expect(reopened.id).toBe(opened.id);
    expect(await Conversation.countDocuments({ type: CONVERSATION_TYPE.DIRECT })).toBe(1);
  });

  it('is not available to patients', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .post(url('/chat/direct'))
      .set(patient.headers)
      .send({ userId: String(doctor.user._id) });

    expectError(res, 403, 'FORBIDDEN');
  });

  it('refuses a direct thread addressed to a patient', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/chat/direct'))
      .set(doctor.headers)
      .send({ userId: String(patient.user._id) });

    // Blocked from the staff side too: a patient's only channel is their care
    // team, whoever initiates.
    expectError(res, 403, 'PATIENT_NOT_ALLOWED');
  });

  it('refuses a thread with yourself', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api()
      .post(url('/chat/direct'))
      .set(doctor.headers)
      .send({ userId: String(doctor.user._id) });

    // The model would reject it anyway (a direct thread needs two distinct
    // participants); catching it here keeps that from surfacing as a 500.
    expectError(res, 400, 'BAD_REQUEST');
  });
});

describe('chat — messages', () => {
  it('refuses history to someone who is not in the thread', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE);
    const outsider = await createActor(ROLES.DOCTOR);
    const staff = expectOk(await openStaff(doctor, [nurse]), 201);
    expectOk(await say(staff.id, doctor, 'Bed 12 is ready.'), 201);

    expectError(await historyOf(staff.id, outsider), 404, 'NOT_FOUND');
  });

  it('notifies every participant except the sender', async () => {
    const { doctor, nurse, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    expectOk(await say(conversation.id, doctor, 'Vitals at 08:00 please.'), 201);

    // Dispatched without `await` so a failed push cannot fail a stored message —
    // hence the poll rather than a bare read.
    const notifications = await eventually(async () => {
      const rows = await Notification.find({ type: NOTIFICATION_TYPE.MESSAGE }).lean();
      return rows.length >= 2 ? rows : null;
    });

    expect(notifications).not.toBeNull();
    expect(notifications.map((row) => String(row.recipient)).sort()).toEqual(
      [patient.user._id, nurse.user._id].map(String).sort()
    );
    expect(notifications[0].data.conversationId).toBe(String(conversation.id));
  });

  it('counts unread for the recipient but not the sender, and clears on read', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);
    expectOk(await say(conversation.id, doctor, 'Please fast from midnight.'), 201);

    const unreadFor = async (actor) =>
      expectOk(await api().get(url('/chat/unread')).set(actor.headers));

    expect((await unreadFor(patient)).total).toBe(1);
    // The sender has by definition read their own message.
    expect((await unreadFor(doctor)).total).toBe(0);

    const read = await api().post(url(`/chat/${conversation.id}/read`)).set(patient.headers).send({});
    expect(expectOk(read).read).toBe(true);
    expect(read.body.message).toBe('Marked as read');

    expect((await unreadFor(patient)).total).toBe(0);
  });

  it('lets an author delete their own message and nobody else’s', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);
    const fromDoctor = expectOk(await say(conversation.id, doctor, 'Fasting from midnight.'), 201);
    const fromPatient = expectOk(await say(conversation.id, patient, 'Sent by mistake'), 201);

    const deleted = await api()
      .delete(url(`/chat/messages/${fromPatient.id}`))
      .set(patient.headers);
    expectOk(deleted);
    expect(deleted.body.message).toBe('Message deleted');

    const history = expectOk(await historyOf(conversation.id, patient));
    expect(history.map((message) => message.id)).toEqual([fromDoctor.id]);

    // Nobody edits someone else's words out of a clinical thread.
    const theirs = await api()
      .delete(url(`/chat/messages/${fromDoctor.id}`))
      .set(patient.headers);
    expectError(theirs, 403, 'FORBIDDEN');
  });

  it('refuses a message with neither a body nor an attachment', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    const res = await api()
      .post(url(`/chat/${conversation.id}/messages`))
      .set(doctor.headers)
      .send({});

    expectError(res, 422, 'VALIDATION_ERROR');
  });

  it('refuses a message to an archived thread', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    expectOk(
      await api()
        .patch(url(`/chat/${conversation.id}/archive`))
        .set(doctor.headers)
        .send({ isArchived: true })
    );

    expectError(await say(conversation.id, patient, 'Hello?'), 409, 'CONFLICT');
  });
});

describe('chat — membership', () => {
  it('records a join in the transcript', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const doctor = await createActor(ROLES.DOCTOR);
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const conversation = expectOk(await openStaff(nurse, [doctor], { title: 'Ward round' }), 201);

    const res = await api()
      .post(url(`/chat/${conversation.id}/participants`))
      .set(nurse.headers)
      .send({ userId: String(pharmacist.user._id) });

    expect(expectOk(res).added).toBe(true);
    expect(res.body.message).toBe('Participant added');

    // Visible in the thread, not just in a log: people should be able to see who
    // joined and when, especially on a channel about a patient.
    const history = expectOk(await historyOf(conversation.id, doctor));
    expect(history).toHaveLength(1);
    expect(history[0].systemEvent.kind).toBe('participant_added');
    expect(history[0].body).toContain('joined');

    const seen = expectOk(await historyOf(conversation.id, pharmacist));
    expect(seen).toHaveLength(1);
  });

  it('refuses to remove the patient from their own care channel', async () => {
    const { doctor, patient } = await careTeam();
    const conversation = expectOk(await openCareTeam(patient, doctor), 201);

    const res = await api()
      .delete(url(`/chat/${conversation.id}/participants/${patient.user._id}`))
      .set(doctor.headers);

    // Otherwise the thread becomes a channel about someone that they cannot see
    // — the staff channel, wearing the care channel's name.
    expectError(res, 403, 'FORBIDDEN');
  });

  it('lets only the thread owner archive it', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const doctor = await createActor(ROLES.DOCTOR);
    const conversation = expectOk(await openStaff(nurse, [doctor]), 201);

    const archive = (actor) =>
      api().patch(url(`/chat/${conversation.id}/archive`)).set(actor.headers).send({ isArchived: true });

    expectError(await archive(doctor), 403, 'FORBIDDEN');
    expect(expectOk(await archive(nurse)).isArchived).toBe(true);
  });
});
