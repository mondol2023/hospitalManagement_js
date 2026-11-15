'use strict';

const { conversationRepository, messageRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { actorId, requireMember } = require('../utils/chatGuard');
const { SOCKET_EVENTS, NOTIFICATION_TYPE } = require('../utils/constants');
const realtimeService = require('./realtimeService');
const notificationService = require('./notificationService');

// What is said inside a thread: history, send, read state and deletion.
class MessageService {
  constructor({
    conversations = conversationRepository,
    messages = messageRepository,
    notifications = notificationService,
    realtime = realtimeService,
  } = {}) {
    this.conversations = conversations;
    this.messages = messages;
    this.notifications = notifications;
    this.realtime = realtime;
  }

  // `query.before` is a cursor: the `createdAt` of the oldest message already held.
  async history(conversationId, actor, query = {}) {
    await requireMember(this.conversations, conversationId, actor);
    return this.messages.history(conversationId, { before: query.before, limit: query.limit });
  }

  // Threads whose last message predates `lastReadAt` are skipped in memory, so only
  // genuinely unread ones hit the messages collection.
  async unreadSummary(actor) {
    const userId = actorId(actor);
    const docs = await this.conversations.find(
      { participants: userId, isArchived: false, lastMessageAt: { $ne: null } },
      { projection: 'reads lastMessageAt type', sort: { lastMessageAt: -1 }, limit: 100, lean: true }
    );

    const lastReadOf = (doc) => {
      const mine = (doc.reads || []).find((entry) => String(entry.user) === String(userId));
      return mine && mine.lastReadAt;
    };

    const candidates = docs.filter((doc) => {
      const lastReadAt = lastReadOf(doc);
      return !lastReadAt || new Date(doc.lastMessageAt) > new Date(lastReadAt);
    });

    const counted = await Promise.all(
      candidates.map(async (doc) => ({
        conversation: String(doc._id),
        type: doc.type,
        unread: await this.messages.countUnread(doc._id, userId, lastReadOf(doc)),
      }))
    );

    const byConversation = counted.filter((entry) => entry.unread > 0);
    return {
      total: byConversation.reduce((sum, entry) => sum + entry.unread, 0),
      conversations: byConversation.length,
      byConversation,
    };
  }

  // Only storing the message is durable; push and notifications are best effort so a
  // failed push cannot make the sender retry into duplicates.
  async send(conversationId, { body, attachments } = {}, actor) {
    const conversation = await requireMember(this.conversations, conversationId, actor);
    if (conversation.isArchived) {
      throw ApiError.conflict('This conversation is archived');
    }

    const text = typeof body === 'string' ? body.trim() : '';
    if (!text && !(attachments && attachments.length)) {
      throw ApiError.badRequest('A message needs a body or an attachment');
    }

    const senderId = actorId(actor);
    const at = new Date();
    const message = await this.messages.create({
      conversation: conversation._id,
      sender: senderId,
      body: text || '(attachment)',
      attachments,
    });

    await this.conversations.recordMessage(conversation._id, {
      body: message.body,
      sender: senderId,
      at,
    });
    // The sender has by definition read their own message.
    await this.conversations.markRead(conversation._id, senderId, at);

    this.realtime.toConversation(conversation._id, SOCKET_EVENTS.MESSAGE_NEW, {
      conversation: String(conversation._id),
      message: {
        ...message.toJSON(),
        sender: { _id: senderId, name: actor.name, role: actor.role },
      },
    });

    this._notifyRecipients(conversation, actor, message.body).catch((error) =>
      logger.error('Chat notification failed', {
        conversationId: String(conversation._id),
        error: error.message,
      })
    );

    return message.toJSON();
  }

  // Advances the actor's read marker and tells the room, for read receipts.
  async markRead(conversationId, actor, at = new Date()) {
    await requireMember(this.conversations, conversationId, actor);
    const userId = actorId(actor);

    await this.conversations.markRead(conversationId, userId, at);
    this.realtime.toConversation(conversationId, SOCKET_EVENTS.MESSAGE_READ, {
      conversation: String(conversationId),
      user: userId,
      at,
    });
    return { read: true, at };
  }

  // Authors only: nobody silently edits someone else's words out of a clinical thread.
  async deleteMessage(messageId, actor) {
    const deleted = await this.messages.softDelete(messageId, actorId(actor));
    if (deleted) return deleted;

    const message = await this.messages.findByIdOrThrow(messageId, 'Message', { projection: 'sender deletedAt' });
    if (message.deletedAt) throw ApiError.conflict('That message is already deleted');
    throw ApiError.forbidden('You can only delete your own messages');
  }

  // Membership changes belong in the transcript. Best effort: the change already committed.
  async postSystemMessage(conversation, actor, kind, body, data) {
    const senderId = actorId(actor);
    try {
      const message = await this.messages.create({
        conversation: conversation._id,
        sender: senderId,
        body,
        systemEvent: { kind, data },
      });
      await this.conversations.recordMessage(conversation._id, {
        body,
        sender: senderId,
        at: new Date(),
      });
      this.realtime.toConversation(conversation._id, SOCKET_EVENTS.MESSAGE_NEW, {
        conversation: String(conversation._id),
        message: message.toJSON(),
      });
    } catch (error) {
      logger.error('Failed to post system message', {
        conversationId: String(conversation._id),
        kind,
        error: error.message,
      });
    }
  }

  // No presence tracking on purpose: a redundant notification is minor, a missed handover is not.
  async _notifyRecipients(conversation, actor, body) {
    const senderId = actorId(actor);
    const recipients = conversation.participants.map(String).filter((id) => id !== senderId);
    if (!recipients.length) return;

    await this.notifications.notifyMany(recipients, {
      title: actor.name ? `Message from ${actor.name}` : 'New message',
      message: String(body).slice(0, 140),
      type: NOTIFICATION_TYPE.MESSAGE,
      data: { conversationId: String(conversation._id) },
    });
  }
}

module.exports = new MessageService();
module.exports.MessageService = MessageService;
