'use strict';

const BaseRepository = require('./BaseRepository');
const { Notification } = require('../models');

class NotificationRepository extends BaseRepository {
  constructor() {
    super(Notification, { sortableFields: ['isRead'], defaultSort: { createdAt: -1 } });
  }

  inboxFor(userId, query = {}) {
    const filter = { recipient: userId };
    if (query.unreadOnly === 'true' || query.unreadOnly === true) filter.isRead = false;
    if (query.type) filter.type = query.type;
    return this.paginate(filter, query);
  }

  countUnread(userId) {
    return this.count({ recipient: userId, isRead: false });
  }

  markRead(notificationId, userId) {
    return this.updateOne(
      { _id: notificationId, recipient: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  markAllRead(userId) {
    return this.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  /**
   * Fan-out in one round trip. `insertMany` with `ordered: false` keeps going if a
   * single document fails, so one bad recipient cannot drop the whole broadcast.
   */
  createMany(payloads, { session } = {}) {
    if (!payloads.length) return Promise.resolve([]);
    return this.model.insertMany(payloads, { session, ordered: false });
  }
}

module.exports = new NotificationRepository();
