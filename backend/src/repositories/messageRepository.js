'use strict';

const BaseRepository = require('./BaseRepository');
const { Message } = require('../models');

class MessageRepository extends BaseRepository {
  constructor() {
    super(Message, { sortableFields: ['createdAt'], defaultSort: { createdAt: -1 } });
  }

  /**
   * A page of history, newest first.
   *
   * `before` gives keyset pagination for infinite scroll: skip/limit degrades
   * badly deep into a long thread because the server still walks every skipped
   * document, whereas this is a direct seek on `{ conversation, createdAt }`.
   */
  history(conversationId, { before, limit = 50 } = {}) {
    const filter = { conversation: conversationId, deletedAt: null };
    if (before) filter.createdAt = { $lt: new Date(before) };

    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 100))
      .populate({ path: 'sender', select: 'name role profilePic' })
      .lean()
      .exec();
  }

  /** Unread count for one participant, using their stored `lastReadAt`. */
  countUnread(conversationId, userId, lastReadAt) {
    const filter = { conversation: conversationId, sender: { $ne: userId }, deletedAt: null };
    if (lastReadAt) filter.createdAt = { $gt: lastReadAt };
    return this.count(filter);
  }

  /** Soft delete: the message stays as an auditable record of what was sent. */
  softDelete(messageId, senderId) {
    return this.updateOne(
      { _id: messageId, sender: senderId, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
  }

  deleteForConversation(conversationId, { session } = {}) {
    return this.deleteMany({ conversation: conversationId }, { session });
  }
}

module.exports = new MessageRepository();
