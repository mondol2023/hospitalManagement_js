'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_VALUES,
} = require('../utils/constants');

/**
 * Fixes: the schema declared `recipient`/`isRead`/`message`, but
 * `notificationController` queried `user`, wrote `read`, and `notificationService`
 * created documents with `userId`/`content` — three modules, three different
 * field vocabularies, none of which matched the schema. Every notification write
 * failed validation and every read returned nothing.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: NOTIFICATION_TYPE_VALUES,
      default: NOTIFICATION_TYPE.SYSTEM,
    },
    channels: {
      type: [{ type: String, enum: NOTIFICATION_CHANNEL_VALUES }],
      default: [NOTIFICATION_CHANNEL.IN_APP],
    },
    /** Free-form payload for client-side deep links (e.g. appointment id). */
    data: { type: mongoose.Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    /**
     * TTL: notifications self-expire after 90 days. Without this the collection
     * grows without bound — at 10k users it is the fastest-growing table here.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

notificationSchema.plugin(toJSONPlugin);
notificationSchema.plugin(tenantScoped, { scope: 'organization' });

// --- Indexes ---------------------------------------------------------------
// The inbox query: this user's notifications, newest first.
notificationSchema.index({ organization: 1, recipient: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ organization: 1, recipient: 1, isRead: 1 });
// Background expiry, handled by MongoDB rather than a cron job.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
