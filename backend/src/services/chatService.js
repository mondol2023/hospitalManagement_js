'use strict';

const { conversationRepository, messageRepository, userRepository } = require('../repositories');
const realtimeService = require('./realtimeService');
const notificationService = require('./notificationService');
const patientService = require('./patientService');
const { ConversationService } = require('./conversationService');
const { MessageService } = require('./messageService');

/**
 * Facade over `ConversationService` (membership, lifecycle) and `MessageService`
 * (send, read, delete), so controllers and the socket gateway keep one entry point.
 */
class ChatService {
  constructor({
    conversations = conversationRepository,
    messages = messageRepository,
    users = userRepository,
    patients = patientService,
    notifications = notificationService,
    realtime = realtimeService,
    messaging = new MessageService({ conversations, messages, notifications, realtime }),
    threads = new ConversationService({ conversations, users, patients, messaging, realtime }),
  } = {}) {
    this.messaging = messaging;
    this.threads = threads;
  }

  inbox(actor, query) {
    return this.threads.inbox(actor, query);
  }

  getById(conversationId, actor) {
    return this.threads.getById(conversationId, actor);
  }

  openCareTeam(patientId, actor) {
    return this.threads.openCareTeam(patientId, actor);
  }

  createStaffThread(payload, actor) {
    return this.threads.createStaffThread(payload, actor);
  }

  openDirect(otherUserId, actor) {
    return this.threads.openDirect(otherUserId, actor);
  }

  addParticipant(conversationId, userId, actor) {
    return this.threads.addParticipant(conversationId, userId, actor);
  }

  removeParticipant(conversationId, userId, actor) {
    return this.threads.removeParticipant(conversationId, userId, actor);
  }

  setArchived(conversationId, isArchived, actor) {
    return this.threads.setArchived(conversationId, isArchived, actor);
  }

  history(conversationId, actor, query) {
    return this.messaging.history(conversationId, actor, query);
  }

  unreadSummary(actor) {
    return this.messaging.unreadSummary(actor);
  }

  send(conversationId, payload, actor) {
    return this.messaging.send(conversationId, payload, actor);
  }

  markRead(conversationId, actor, at) {
    return this.messaging.markRead(conversationId, actor, at);
  }

  deleteMessage(messageId, actor) {
    return this.messaging.deleteMessage(messageId, actor);
  }
}

module.exports = new ChatService();
module.exports.ChatService = ChatService;
