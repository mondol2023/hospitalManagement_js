'use strict';

const { conversationRepository, userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { actorId, requireMember } = require('../utils/chatGuard');
const { ROLES, CONVERSATION_TYPE, SOCKET_EVENTS } = require('../utils/constants');
const realtimeService = require('./realtimeService');
const patientService = require('./patientService');
const messageService = require('./messageService');
const { resolveName } = require('./departmentRefs');

/**
 * Who is in which thread. Three kinds exist: `care_team` (the only one a patient can
 * be in), `staff_only` and `direct` (staff-to-staff). The wall between them is
 * `accessPolicy.canJoinConversation`, applied at create, add and read; the socket
 * gateway skips the route guards, so the check is repeated here.
 */
class ConversationService {
  constructor({
    conversations = conversationRepository,
    users = userRepository,
    patients = patientService,
    messaging = messageService,
    realtime = realtimeService,
  } = {}) {
    this.conversations = conversations;
    this.users = users;
    this.patients = patients;
    this.messaging = messaging;
    this.realtime = realtime;
  }

  // Membership is filtered in the query itself, so `query.type` cannot page into a foreign thread.
  inbox(actor, query = {}) {
    return this.conversations.inboxFor(actorId(actor), query);
  }

  async getById(conversationId, actor) {
    await requireMember(this.conversations, conversationId, actor);
    return this.conversations.findById(conversationId, {
      populate: [
        { path: 'participants', select: 'name role profilePic' },
        { path: 'patient', select: 'medicalRecordNumber ward' },
        { path: 'department', select: 'name' },
      ],
    });
  }

  // Created on first use. Membership follows the care team, and a clinician added later
  // is folded in on their first visit, so no background job is needed to keep it in sync.
  async openCareTeam(patientId, actor) {
    const { patientUserId, clinicianUserIds } = await this.patients.careTeam(patientId);
    const userId = actorId(actor);

    const isPatient = patientUserId && String(patientUserId) === userId;
    const isAssigned = clinicianUserIds.map(String).includes(userId);
    if (!isPatient && !isAssigned && !accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only this patient’s care team can open their channel');
    }

    const existing = await this.conversations.careTeamFor(patientId);
    if (existing) {
      if (!existing.participants.map(String).includes(userId)) {
        await this.conversations.addParticipant(existing._id, userId);
        return this.conversations.findById(existing._id);
      }
      return existing;
    }

    if (!clinicianUserIds.length) {
      throw ApiError.badRequest(
        'Assign a doctor or nurse to this patient before opening their care channel',
        { code: 'NO_CARE_TEAM' }
      );
    }
    if (!patientUserId) {
      throw ApiError.badRequest('This patient has no login to include in the channel');
    }

    const participants = this._dedupe([patientUserId, ...clinicianUserIds]);
    const conversation = await this._create(
      {
        type: CONVERSATION_TYPE.CARE_TEAM,
        patient: patientId,
        participants,
        title: 'Care team',
        createdBy: userId,
      },
      participants
    );

    logger.info('Care-team channel opened', {
      patientId: String(patientId),
      conversationId: String(conversation._id),
    });
    return conversation;
  }

  // A patient in the list is a hard error, not a silent drop: the caller must not believe
  // a patient is in a conversation they cannot see.
  async createStaffThread({ title, department, participantIds = [] }, actor) {
    if (!accessPolicy.isStaff(actor.role)) {
      throw ApiError.forbidden('Only hospital staff can open a staff channel');
    }

    const userId = actorId(actor);
    const requested = this._dedupe([userId, ...participantIds]);
    if (requested.length < 2) {
      throw ApiError.badRequest('A conversation needs at least one other participant');
    }

    const users = await this._loadParticipants(requested);
    if (users.some((user) => user.role === ROLES.PATIENT)) {
      throw ApiError.forbidden('Patients cannot join a staff-only channel', {
        code: 'PATIENT_NOT_ALLOWED',
      });
    }

    const participants = users.map((user) => String(user._id));
    const conversation = await this._create(
      {
        type: CONVERSATION_TYPE.STAFF_ONLY,
        title: title || 'Staff channel',
        department: await resolveName(department),
        participants,
        createdBy: userId,
      },
      participants
    );

    logger.info('Staff channel opened', {
      conversationId: String(conversation._id),
      participants: participants.length,
    });
    return conversation;
  }

  // Both sides must pass `canJoinConversation`, which rejects patients.
  async openDirect(otherUserId, actor) {
    const userId = actorId(actor);
    if (String(otherUserId) === userId) {
      throw ApiError.badRequest('You cannot open a conversation with yourself');
    }
    if (!accessPolicy.canJoinConversation(actor.role, CONVERSATION_TYPE.DIRECT)) {
      throw ApiError.forbidden('Direct messages are for hospital staff');
    }

    const other = await this.users.findById(otherUserId, { projection: 'role isActive name' });
    if (!other || !other.isActive) throw ApiError.notFound('User');
    if (!accessPolicy.canJoinConversation(other.role, CONVERSATION_TYPE.DIRECT)) {
      throw ApiError.forbidden('That user cannot receive direct messages', {
        code: 'PATIENT_NOT_ALLOWED',
      });
    }

    try {
      return await this.conversations.findOrCreateDirect(userId, otherUserId, userId);
    } catch (error) {
      // Racing upserts hit the unique `directKey`; the loser's retry finds the winner's thread.
      if (error.code === 11000) {
        return this.conversations.findOrCreateDirect(userId, otherUserId, userId);
      }
      throw error;
    }
  }

  // Same role wall as creation; a system message keeps the addition visible in the transcript.
  async addParticipant(conversationId, userId, actor) {
    const conversation = await requireMember(this.conversations, conversationId, actor);
    if (conversation.type === CONVERSATION_TYPE.DIRECT) {
      throw ApiError.badRequest('A direct conversation is always between two people');
    }
    if (conversation.hasParticipant(userId)) {
      throw ApiError.conflict('That user is already in this conversation');
    }

    const user = await this.users.findById(userId, { projection: 'role isActive name' });
    if (!user || !user.isActive) throw ApiError.notFound('User');
    if (!accessPolicy.canJoinConversation(user.role, conversation.type)) {
      throw ApiError.forbidden('That user cannot join this kind of conversation', {
        code: 'ROLE_NOT_ALLOWED',
      });
    }

    await this.conversations.addParticipant(conversationId, userId);
    await this.messaging.postSystemMessage(
      conversation,
      actor,
      'participant_added',
      `${user.name} joined`,
      { user: String(userId) }
    );

    this.realtime.toUser(userId, SOCKET_EVENTS.CONVERSATION_NEW, {
      conversation: String(conversationId),
      type: conversation.type,
    });
    return { added: true };
  }

  async removeParticipant(conversationId, userId, actor) {
    const conversation = await requireMember(this.conversations, conversationId, actor);
    if (conversation.type === CONVERSATION_TYPE.DIRECT) {
      throw ApiError.badRequest('A direct conversation cannot lose a participant');
    }
    if (!conversation.hasParticipant(userId)) {
      throw ApiError.notFound('Participant');
    }
    if (conversation.participants.length <= 2) {
      throw ApiError.conflict('A conversation needs at least two participants');
    }

    const requesterId = actorId(actor);
    const isSelf = String(userId) === requesterId;
    if (!isSelf && !this._ownsOrAdmin(conversation, actor)) {
      throw ApiError.forbidden('Only the thread owner or an administrator can remove others');
    }

    // The patient is why a care-team thread exists; removing them leaves a channel they cannot see.
    if (
      conversation.type === CONVERSATION_TYPE.CARE_TEAM &&
      conversation.patient &&
      (await this._isPatientUser(conversation.patient, userId))
    ) {
      throw ApiError.forbidden('The patient cannot be removed from their own care channel');
    }

    await this.conversations.removeParticipant(conversationId, userId);
    await this.messaging.postSystemMessage(
      conversation,
      actor,
      'participant_removed',
      isSelf ? 'Left the conversation' : 'A participant was removed',
      { user: String(userId) }
    );
    return { removed: true };
  }

  // Hides a thread from every inbox; history is kept.
  async setArchived(conversationId, isArchived, actor) {
    const conversation = await requireMember(this.conversations, conversationId, actor);
    if (!this._ownsOrAdmin(conversation, actor)) {
      throw ApiError.forbidden('Only the thread owner or an administrator can archive it');
    }
    return this.conversations.updateById(conversationId, {
      $set: { isArchived: Boolean(isArchived) },
    });
  }

  _ownsOrAdmin(conversation, actor) {
    return (
      accessPolicy.isAdmin(actor.role) || String(conversation.createdBy) === actorId(actor)
    );
  }

  // Creates the thread and tells every participant it exists.
  async _create(payload, participants) {
    const conversation = await this.conversations.create({
      ...payload,
      lastMessageAt: new Date(),
    });

    this.realtime.toUsers(participants, SOCKET_EVENTS.CONVERSATION_NEW, {
      conversation: String(conversation._id),
      type: conversation.type,
      title: conversation.title,
    });
    return conversation;
  }

  async _isPatientUser(patientId, userId) {
    const { patientUserId } = await this.patients.careTeam(patientId);
    return Boolean(patientUserId) && String(patientUserId) === String(userId);
  }

  // Validates a participant list in one query.
  async _loadParticipants(ids) {
    const users = await this.users.find(
      { _id: { $in: ids }, isActive: true },
      { projection: 'role name', lean: true, limit: 100 }
    );
    if (users.length !== ids.length) {
      throw ApiError.badRequest('One or more participants could not be found');
    }
    return users;
  }

  _dedupe(ids) {
    return [...new Set(ids.filter(Boolean).map(String))];
  }
}

module.exports = new ConversationService();
module.exports.ConversationService = ConversationService;
