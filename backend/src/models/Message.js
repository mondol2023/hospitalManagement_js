'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');

/**
 * One message inside a `Conversation`.
 *
 * Fixes against the original `Chat.js`: the schema declared `recipient` while
 * `chatController` wrote `receiver`, so every message failed validation on a
 * missing required field. History was then fetched with a two-branch `$or` over
 * unindexed fields — a full collection scan on every conversation open, on what
 * will be the largest collection in the deployment.
 *
 * Membership now lives on the conversation, so a message carries only its
 * thread and its author: authorisation is one indexed conversation lookup, and
 * history is one indexed range scan.
 */
const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: [5000, 'Message is too long'],
    },
    attachments: [{ url: String, mimeType: String, sizeBytes: Number, label: String }],
    /**
     * Machine-generated entries ("Nurse A took over this patient", "bed B-12
     * assigned"). Rendered differently by clients and never authored by a human,
     * which is why the kind is recorded rather than inferred from the text.
     */
    systemEvent: {
      kind: { type: String, trim: true },
      data: { type: mongoose.Schema.Types.Mixed },
    },
    editedAt: { type: Date },
    /** Soft delete — a clinical conversation is an auditable record. */
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// Paged thread history, newest first. The only read path that matters.
messageSchema.index({ conversation: 1, createdAt: -1 });
// Unread counting: messages in a thread after the caller's lastReadAt, from
// someone else. Covered by the index above; sender is added for the
// "not my own messages" filter.
messageSchema.index({ conversation: 1, sender: 1, createdAt: -1 });

messageSchema.virtual('isDeleted').get(function isDeleted() {
  return Boolean(this.deletedAt);
});

module.exports = mongoose.model('Message', messageSchema);
