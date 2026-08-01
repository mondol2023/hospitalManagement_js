'use strict';

const { notificationRepository, userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const realtimeService = require('./realtimeService');
const { emailProvider, smsProvider } = require('./providers');
const {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  SOCKET_EVENTS,
} = require('../utils/constants');

/**
 * The one way anything in this system tells a human something happened.
 *
 * Three delivery paths, in order of importance:
 *  1. the stored `Notification` document — the durable record, always written;
 *  2. a socket push, so an open client updates without polling;
 *  3. email/SMS, which are courtesy copies.
 *
 * Only (1) is allowed to fail the caller. (2) and (3) are dispatched without
 * being awaited: an SMTP handshake takes seconds, and no clinical action — least
 * of all raising an emergency — should sit behind one. Providers already swallow
 * their own errors, so the detached promise cannot produce an unhandled
 * rejection; the `.catch` is belt-and-braces for a programming error inside the
 * dispatcher itself.
 */
class NotificationService {
  constructor({
    repository = notificationRepository,
    users = userRepository,
    realtime = realtimeService,
    email = emailProvider,
    sms = smsProvider,
  } = {}) {
    this.repository = repository;
    this.users = users;
    this.realtime = realtime;
    this.email = email;
    this.sms = sms;
  }

  /**
   * @param {object} payload
   * @param {string} payload.recipient user id
   * @param {string} payload.title
   * @param {string} payload.message
   * @param {string} [payload.type] one of NOTIFICATION_TYPE
   * @param {string[]} [payload.channels] defaults to in-app only
   * @param {object} [payload.data] arbitrary client routing hints (ids, deep links)
   * @param {object} [options]
   * @param {import('mongoose').ClientSession} [options.session]
   */
  async notify(payload, { session } = {}) {
    const notification = await this.repository.create(
      this._normalise(payload),
      { session }
    );
    const json = notification.toJSON();

    this.realtime.toUser(payload.recipient, SOCKET_EVENTS.NOTIFICATION_NEW, json);
    this._dispatchExternal([payload.recipient], json);

    return json;
  }

  /**
   * Fan-out to many recipients in one insert.
   *
   * Used by ward alerts and emergency broadcasts, where the alternative — a
   * `notify()` per recipient — would be one round trip per on-duty nurse.
   *
   * @param {string[]} recipients
   */
  async notifyMany(recipients, payload, { session } = {}) {
    const unique = [...new Set((recipients || []).filter(Boolean).map(String))];
    if (!unique.length) return [];

    const base = this._body(payload);
    const docs = await this.repository.createMany(
      unique.map((recipient) => ({ ...base, recipient })),
      { session }
    );

    const json = { ...base, createdAt: new Date() };
    this.realtime.toUsers(unique, SOCKET_EVENTS.NOTIFICATION_NEW, json);
    this._dispatchExternal(unique, json);

    return docs;
  }

  list(userId, query = {}) {
    return this.repository.inboxFor(userId, query);
  }

  countUnread(userId) {
    return this.repository.countUnread(userId);
  }

  /**
   * Scoped by recipient in the filter, not checked afterwards — a user cannot
   * mark someone else's notification read even by guessing its id.
   */
  async markRead(notificationId, userId) {
    const updated = await this.repository.markRead(notificationId, userId);
    if (!updated) throw ApiError.notFound('Notification');
    return updated;
  }

  async markAllRead(userId) {
    const result = await this.repository.markAllRead(userId);
    return { updated: result.modifiedCount || 0 };
  }

  /**
   * @private the part of a notification that does not depend on who receives it.
   *
   * Split out from `_normalise` because a fan-out has no single recipient, and
   * building one payload and stamping each recipient onto a copy is the whole
   * point of `notifyMany`. Sharing the recipient check between the two is what
   * previously made every broadcast in the system throw — invisibly, because the
   * one caller that matters wraps escalation in a best-effort catch.
   */
  _body({ title, message, type, channels, data, expiresAt }) {
    return {
      title,
      message,
      type: type || NOTIFICATION_TYPE.SYSTEM,
      channels: channels && channels.length ? channels : [NOTIFICATION_CHANNEL.IN_APP],
      data: data || {},
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  /** @private a single stored notification: the shared body plus its addressee. */
  _normalise(payload) {
    if (!payload.recipient) throw ApiError.badRequest('A notification needs a recipient');
    return { ...this._body(payload), recipient: payload.recipient };
  }

  /**
   * @private best-effort email/SMS. Detached on purpose — see the class comment.
   */
  _dispatchExternal(recipientIds, payload) {
    const channels = payload.channels || [];
    const wantsEmail = channels.includes(NOTIFICATION_CHANNEL.EMAIL);
    const wantsSms = channels.includes(NOTIFICATION_CHANNEL.SMS);
    if (!wantsEmail && !wantsSms) return;
    if (wantsEmail && !this.email.isEnabled && (!wantsSms || !this.sms.isEnabled)) return;

    this._deliver(recipientIds, payload, { wantsEmail, wantsSms }).catch((error) =>
      logger.error('Notification fan-out failed', { error: error.message })
    );
  }

  /** @private */
  async _deliver(recipientIds, payload, { wantsEmail, wantsSms }) {
    const recipients = await this.users.find(
      { _id: { $in: recipientIds }, isActive: true },
      { projection: 'name email phone', limit: recipientIds.length }
    );

    await Promise.all(
      recipients.map(async (user) => {
        if (wantsEmail && user.email) {
          await this.email.send({
            to: user.email,
            subject: payload.title,
            text: payload.message,
          });
        }
        if (wantsSms && user.phone) {
          await this.sms.send({
            to: user.phone,
            body: `${payload.title}: ${payload.message}`,
          });
        }
      })
    );
  }
}

module.exports = new NotificationService();
module.exports.NotificationService = NotificationService;
