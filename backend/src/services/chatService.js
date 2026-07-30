'use strict';

const {
  conversationRepository,
  messageRepository,
  userRepository,
} = require('../repositories');
const { Conversation } = require('../models');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const {
  ROLES,
  CONVERSATION_TYPE,
  SOCKET_EVENTS,
  NOTIFICATION_TYPE,
} = require('../utils/constants');
const realtimeService = require('./realtimeService');
const notificationService = require('./notificationService');
const patientService = require('./patientService');

/**
 * Messaging.
 *
 * There are exactly three kinds of thread, and the distinction is the whole
 * point of the feature:
 *
 *  - **`care_team`** — the patient, their doctor and their nurses. This is the
 *    only thread a patient can ever be in.
 *  - **`staff_only`** — doctors, nurses, receptionists, pharmacists, managers.
 *    The clinical back-channel: handovers, "is bed 12 ready", escalation chatter
 *    that must never surface to the person being discussed.
 *  - **`direct`** — a private 1:1 between two employees. Staff-to-staff by
 *    definition, since a patient fails the role check for it.
 *
 * The wall between the first two is enforced three times over — in the model's
 * pre-validate hook, in `Conversation.isRoleAllowed`, and again here — not out of
 * paranoia but because each layer can be bypassed by a plausible refactor: a new
 * route that forgets the middleware, a bulk import that writes documents
 * directly. The one that cannot be bypassed is the schema, so that is where the
 * final answer lives; this layer exists to turn a violation into a clean 403
 * instead of a validation error.
 *
 * Authorisation for reading a thread is deliberately *membership only*, with no
 * administrator override: a manager who needs to read a private conversation can
 * add themselves through `addParticipant`, which leaves a system message in the
 * thread. Silent supervisory access to clinical messaging is the kind of thing
 * that should be visible to the people in the room.
 */
class ChatService {
  constructor({
    conversations = conversationRepository,
    messages = messageRepository,
    users = userRepository,
    patients = patientService,
    notifications = notificationService,
    realtime = realtimeService,
  } = {}) {
    this.conversations = conversations;
    this.messages = messages;
    this.users = users;
    this.patients = patients;
    this.notifications = notifications;
    this.realtime = realtime;
  }

  // --- reading -------------------------------------------------------------

  /**
   * The actor's threads, newest activity first.
   *
   * Filtered by membership in the query itself, so there is no way to page into
   * a conversation you are not part of, whatever `query.type` says.
   */
  inbox(actor, query = {}) {
    return this.conversations.inboxFor(this._actorId(actor), query);
  }

  async getById(conversationId, actor) {
    await this._requireMember(conversationId, actor);
    return this.conversations.findById(conversationId, {
      populate: [
        { path: 'participants', select: 'name role profilePic' },
        { path: 'patient', select: 'medicalRecordNumber ward' },
      ],
    });
  }

  /**
   * A page of message history, newest first.
   *
   * @param {object} [query]
   * @param {string|Date} [query.before] cursor — pass the `createdAt` of the
   *   oldest message you already have to fetch the page before it
   */
  async history(conversationId, actor, query = {}) {
    await this._requireMember(conversationId, actor);
    return this.messages.history(conversationId, {
      before: query.before,
      limit: query.limit,
    });
  }

  /**
   * Unread badges.
   *
   * The denormalised `lastMessageAt` does the filtering first, in memory: a
   * thread whose last message predates the actor's `lastReadAt` needs no count
   * query at all. Only the genuinely-unread threads — usually a handful — hit the
   * messages collection, so the badge costs a couple of queries rather than one
   * per conversation.
   */
  async unreadSummary(actor) {
    const userId = this._actorId(actor);
    const docs = await this.conversations.find(
      { participants: userId, isArchived: false, lastMessageAt: { $ne: null } },
      { projection: 'reads lastMessageAt type', sort: { lastMessageAt: -1 }, limit: 100, lean: true }
    );

    const candidates = docs.filter((doc) => {
      const mine = (doc.reads || []).find((entry) => String(entry.user) === String(userId));
      const lastReadAt = mine && mine.lastReadAt;
      return !lastReadAt || new Date(doc.lastMessageAt) > new Date(lastReadAt);
    });

    const counted = await Promise.all(
      candidates.map(async (doc) => {
        const mine = (doc.reads || []).find((entry) => String(entry.user) === String(userId));
        const unread = await this.messages.countUnread(doc._id, userId, mine && mine.lastReadAt);
        return { conversation: String(doc._id), type: doc.type, unread };
      })
    );

    const byConversation = counted.filter((entry) => entry.unread > 0);
    return {
      total: byConversation.reduce((sum, entry) => sum + entry.unread, 0),
      conversations: byConversation.length,
      byConversation,
    };
  }

  // --- opening threads -----------------------------------------------------

  /**
   * The patient's care-team channel — created on first use.
   *
   * Membership follows the care team rather than being chosen by hand, so the
   * thread is always exactly "this patient, their doctor, their nurses". A
   * clinician added to the care team after the thread was opened is folded in
   * here on their first visit, which keeps the roster and the channel from
   * drifting apart without a background job.
   */
  async openCareTeam(patientId, actor) {
    const { patientUserId, clinicianUserIds } = await this.patients.careTeam(patientId);
    const actorId = this._actorId(actor);

    const isPatient = patientUserId && String(patientUserId) === actorId;
    const isAssigned = clinicianUserIds.map(String).includes(actorId);
    if (!isPatient && !isAssigned && !accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only this patient’s care team can open their channel');
    }

    const existing = await this.conversations.careTeamFor(patientId);
    if (existing) {
      if (!existing.participants.map(String).includes(actorId)) {
        await this.conversations.addParticipant(existing._id, actorId);
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
        createdBy: actorId,
      },
      participants
    );

    logger.info('Care-team channel opened', {
      patientId: String(patientId),
      conversationId: String(conversation._id),
    });
    return conversation;
  }

  /**
   * A staff-only thread — ward handover, department group, incident huddle.
   *
   * Any patient in the participant list is a hard error rather than a silent
   * drop: quietly removing them would leave the caller believing a patient is in
   * a conversation they cannot see.
   */
  async createStaffThread({ title, department, participantIds = [] }, actor) {
    if (!accessPolicy.isStaff(actor.role)) {
      throw ApiError.forbidden('Only hospital staff can open a staff channel');
    }

    const actorId = this._actorId(actor);
    const requested = this._dedupe([actorId, ...participantIds]);
    if (requested.length < 2) {
      throw ApiError.badRequest('A conversation needs at least one other participant');
    }

    const users = await this._loadParticipants(requested);
    const patients = users.filter((user) => user.role === ROLES.PATIENT);
    if (patients.length) {
      throw ApiError.forbidden('Patients cannot join a staff-only channel', {
        code: 'PATIENT_NOT_ALLOWED',
      });
    }

    const participants = users.map((user) => String(user._id));
    const conversation = await this._create(
      {
        type: CONVERSATION_TYPE.STAFF_ONLY,
        title: title || 'Staff channel',
        department,
        participants,
        createdBy: actorId,
      },
      participants
    );

    logger.info('Staff channel opened', {
      conversationId: String(conversation._id),
      participants: participants.length,
    });
    return conversation;
  }

  /**
   * The private 1:1 between two employees, found or created.
   *
   * Both sides go through `canJoinConversation`, which rejects patients — a
   * patient's only channel is their care team, by design.
   */
  async openDirect(otherUserId, actor) {
    const actorId = this._actorId(actor);
    if (String(otherUserId) === actorId) {
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
      return await this.conversations.findOrCreateDirect(actorId, otherUserId, actorId);
    } catch (error) {
      // Two upserts raced on the unique `directKey`. The loser retries and finds
      // the winner's thread — which is the whole reason the key exists.
      if (error.code === 11000) {
        return this.conversations.findOrCreateDirect(actorId, otherUserId, actorId);
      }
      throw error;
    }
  }

  // --- messaging -----------------------------------------------------------

  /**
   * Posts a message.
   *
   * The durable half is the message plus the conversation's preview counters;
   * everything after that — the socket push, the notifications — is best effort.
   * A failed push must not fail a message that is already stored, or the sender
   * retries and the thread ends up with duplicates.
   */
  async send(conversationId, { body, attachments } = {}, actor) {
    const conversation = await this._requireMember(conversationId, actor);
    if (conversation.isArchived) {
      throw ApiError.conflict('This conversation is archived');
    }

    const text = typeof body === 'string' ? body.trim() : '';
    if (!text && !(attachments && attachments.length)) {
      throw ApiError.badRequest('A message needs a body or an attachment');
    }

    const actorId = this._actorId(actor);
    const at = new Date();
    const message = await this.messages.create({
      conversation: conversation._id,
      sender: actorId,
      body: text || '(attachment)',
      attachments,
    });

    await this.conversations.recordMessage(conversation._id, {
      body: message.body,
      sender: actorId,
      at,
    });
    // The sender has by definition read their own message.
    await this.conversations.markRead(conversation._id, actorId, at);

    const payload = {
      conversation: String(conversation._id),
      message: {
        ...message.toJSON(),
        sender: { _id: actorId, name: actor.name, role: actor.role },
      },
    };
    this.realtime.toConversation(conversation._id, SOCKET_EVENTS.MESSAGE_NEW, payload);

    this._notifyRecipients(conversation, actor, message.body).catch((error) =>
      logger.error('Chat notification failed', {
        conversationId: String(conversation._id),
        error: error.message,
      })
    );

    return message.toJSON();
  }

  /** Advances the actor's read marker and tells the room, for read receipts. */
  async markRead(conversationId, actor, at = new Date()) {
    await this._requireMember(conversationId, actor);
    const actorId = this._actorId(actor);

    await this.conversations.markRead(conversationId, actorId, at);
    this.realtime.toConversation(conversationId, SOCKET_EVENTS.MESSAGE_READ, {
      conversation: String(conversationId),
      user: actorId,
      at,
    });
    return { read: true, at };
  }

  /**
   * Soft-deletes a message. Authors only — an administrator who needs a message
   * gone can act through moderation, but nobody silently edits someone else's
   * words out of a clinical thread.
   */
  async deleteMessage(messageId, actor) {
    const actorId = this._actorId(actor);
    const deleted = await this.messages.softDelete(messageId, actorId);
    if (deleted) return deleted;

    const message = await this.messages.findById(messageId, { projection: 'sender deletedAt' });
    if (!message) throw ApiError.notFound('Message');
    if (message.deletedAt) throw ApiError.conflict('That message is already deleted');
    throw ApiError.forbidden('You can only delete your own messages');
  }

  // --- membership ----------------------------------------------------------

  /**
   * Adds someone to a thread, subject to the same role wall as creation.
   *
   * A system message is posted so the addition is visible in the transcript —
   * people should be able to see who joined and when, particularly on a channel
   * about a patient.
   */
  async addParticipant(conversationId, userId, actor) {
    const conversation = await this._requireMember(conversationId, actor);
    if (conversation.type === CONVERSATION_TYPE.DIRECT) {
      throw ApiError.badRequest('A direct conversation is always between two people');
    }
    if (conversation.hasParticipant(userId)) {
      throw ApiError.conflict('That user is already in this conversation');
    }

    const user = await this.users.findById(userId, { projection: 'role isActive name' });
    if (!user || !user.isActive) throw ApiError.notFound('User');
    if (!Conversation.isRoleAllowed(conversation.type, user.role)) {
      throw ApiError.forbidden('That user cannot join this kind of conversation', {
        code: 'ROLE_NOT_ALLOWED',
      });
    }
    if (!accessPolicy.canJoinConversation(user.role, conversation.type)) {
      throw ApiError.forbidden('That user cannot join this kind of conversation', {
        code: 'ROLE_NOT_ALLOWED',
      });
    }

    await this.conversations.addParticipant(conversationId, userId);
    await this._postSystemMessage(conversation, actor, 'participant_added', `${user.name} joined`, {
      user: String(userId),
    });

    this.realtime.toUser(userId, SOCKET_EVENTS.CONVERSATION_NEW, {
      conversation: String(conversationId),
      type: conversation.type,
    });
    return { added: true };
  }

  async removeParticipant(conversationId, userId, actor) {
    const conversation = await this._requireMember(conversationId, actor);
    if (conversation.type === CONVERSATION_TYPE.DIRECT) {
      throw ApiError.badRequest('A direct conversation cannot lose a participant');
    }
    if (!conversation.hasParticipant(userId)) {
      throw ApiError.notFound('Participant');
    }
    if (conversation.participants.length <= 2) {
      throw ApiError.conflict('A conversation needs at least two participants');
    }

    const actorId = this._actorId(actor);
    const isSelf = String(userId) === actorId;
    if (!isSelf && !accessPolicy.isAdmin(actor.role) && String(conversation.createdBy) !== actorId) {
      throw ApiError.forbidden('Only the thread owner or an administrator can remove others');
    }

    // The patient is the reason a care-team thread exists; removing them would
    // leave a channel about someone that they cannot see.
    if (
      conversation.type === CONVERSATION_TYPE.CARE_TEAM &&
      conversation.patient &&
      (await this._isPatientUser(conversation.patient, userId))
    ) {
      throw ApiError.forbidden('The patient cannot be removed from their own care channel');
    }

    await this.conversations.removeParticipant(conversationId, userId);
    await this._postSystemMessage(
      conversation,
      actor,
      'participant_removed',
      isSelf ? 'Left the conversation' : 'A participant was removed',
      { user: String(userId) }
    );
    return { removed: true };
  }

  /** Archiving hides a thread from every inbox; it does not delete history. */
  async setArchived(conversationId, isArchived, actor) {
    const conversation = await this._requireMember(conversationId, actor);
    const actorId = this._actorId(actor);
    if (!accessPolicy.isAdmin(actor.role) && String(conversation.createdBy) !== actorId) {
      throw ApiError.forbidden('Only the thread owner or an administrator can archive it');
    }
    return this.conversations.updateById(conversationId, { $set: { isArchived: Boolean(isArchived) } });
  }

  // --- internals -----------------------------------------------------------

  /**
   * @private the single authorisation gate. Every read and write above goes
   * through it, and it returns the hydrated document so callers get
   * `hasParticipant()` and the type without a second query.
   */
  async _requireMember(conversationId, actor) {
    const conversation = await this.conversations.findDocForMember(conversationId);
    if (!conversation) throw ApiError.notFound('Conversation');

    const actorId = this._actorId(actor);
    if (!conversation.hasParticipant(actorId)) {
      // 404 rather than 403: a stranger should not be able to probe which
      // conversation ids exist.
      throw ApiError.notFound('Conversation');
    }
    if (!accessPolicy.canJoinConversation(actor.role, conversation.type)) {
      throw ApiError.forbidden('You cannot access this kind of conversation', {
        code: 'ROLE_NOT_ALLOWED',
      });
    }
    return conversation;
  }

  /** @private creates the thread and tells every participant it exists. */
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

  /**
   * @private fan-out for a new message.
   *
   * There is no presence tracking here on purpose: a notification for a message
   * the recipient is currently looking at is a minor annoyance, a missed
   * notification on a ward handover is not. Clients clear the badge on read.
   */
  async _notifyRecipients(conversation, actor, body) {
    const actorId = this._actorId(actor);
    const recipients = conversation.participants
      .map(String)
      .filter((id) => id !== actorId);
    if (!recipients.length) return;

    await this.notifications.notifyMany(recipients, {
      title: actor.name ? `Message from ${actor.name}` : 'New message',
      message: String(body).slice(0, 140),
      type: NOTIFICATION_TYPE.MESSAGE,
      data: { conversationId: String(conversation._id) },
    });
  }

  /** @private membership changes are part of the transcript, not a side note. */
  async _postSystemMessage(conversation, actor, kind, body, data) {
    const at = new Date();
    try {
      const message = await this.messages.create({
        conversation: conversation._id,
        sender: this._actorId(actor),
        body,
        systemEvent: { kind, data },
      });
      await this.conversations.recordMessage(conversation._id, {
        body,
        sender: this._actorId(actor),
        at,
      });
      this.realtime.toConversation(conversation._id, SOCKET_EVENTS.MESSAGE_NEW, {
        conversation: String(conversation._id),
        message: message.toJSON(),
      });
    } catch (error) {
      // The membership change itself has already committed.
      logger.error('Failed to post system message', {
        conversationId: String(conversation._id),
        kind,
        error: error.message,
      });
    }
  }

  /** @private is this user id the patient the thread belongs to? */
  async _isPatientUser(patientId, userId) {
    const { patientUserId } = await this.patients.careTeam(patientId);
    return Boolean(patientUserId) && String(patientUserId) === String(userId);
  }

  /** @private validates a participant list in one query, preserving order. */
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

  /** @private */
  _actorId(actor) {
    const id = actor && accessPolicy.toId(actor.id || actor._id);
    if (!id) throw ApiError.unauthorized();
    return id;
  }

  /** @private */
  _dedupe(ids) {
    return [...new Set(ids.filter(Boolean).map(String))];
  }
}

module.exports = new ChatService();
module.exports.ChatService = ChatService;
