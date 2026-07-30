'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const {
  ROLES,
  CONVERSATION_TYPE,
  CONVERSATION_TYPE_VALUES,
  PATIENT_VISIBLE_CONVERSATIONS,
} = require('../utils/constants');

/**
 * A messaging thread. Replaces the original `Chat` model, which could only
 * express an unstructured 1:1 pair and had no notion of who was allowed to be
 * in it — a doctor discussing a diagnosis and a patient asking about parking
 * were the same object.
 *
 * Two walled channel kinds, plus private 1:1:
 *
 *  - `care_team`  — the patient **and** their clinicians. This is the only kind
 *                   a `patient` account can ever join, so a patient's inbox is
 *                   structurally incapable of containing internal discussion.
 *  - `staff_only` — doctors, nurses and other hospital staff. Patients are
 *                   rejected at the model boundary (`isRoleAllowed`), not by a
 *                   remembered `if` in one controller.
 *  - `direct`     — private 1:1 between two staff members.
 *
 * Read state lives here rather than on each message: a per-participant
 * `lastReadAt` is one small array on one document, whereas a `readBy` array on
 * every message would grow the hottest collection in the system without bound
 * and make "mark conversation read" an unbounded multi-document update.
 */

const readStateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CONVERSATION_TYPE_VALUES, required: true },
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 2,
        message: 'A conversation needs at least two participants',
      },
    },
    /** Required for `care_team`: the patient the thread is about. */
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    title: { type: String, trim: true, maxlength: 200 },
    /** Scopes a `staff_only` thread to a ward or department. */
    department: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Deterministic key for `direct` threads, so repeatedly opening a chat with
     * the same colleague reuses one document instead of creating a new thread
     * per click. Sparse-unique: only `direct` conversations set it.
     */
    directKey: { type: String, default: null },

    // Denormalised preview fields — the inbox lists threads without touching
    // the messages collection at all.
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, trim: true, maxlength: 200 },
    lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messageCount: { type: Number, default: 0, min: 0 },

    reads: { type: [readStateSchema], default: [] },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// The inbox: "my threads, most recent first". Multikey on participants; without
// this every inbox load is a full collection scan.
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
// A patient's care-team thread, and the ward's staff threads.
conversationSchema.index({ patient: 1, type: 1 });
conversationSchema.index({ type: 1, department: 1, lastMessageAt: -1 });
// One thread per staff pair.
conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } }
);

// --- Statics ---------------------------------------------------------------

/**
 * The channel-wall rule, stated once. Both the creation service and the
 * add-participant path call this, so there is no way to bypass it by using a
 * different endpoint.
 *
 * @param {string} type conversation type
 * @param {string} role user role
 * @returns {boolean}
 */
conversationSchema.statics.isRoleAllowed = function isRoleAllowed(type, role) {
  if (role !== ROLES.PATIENT) return true; // all staff may join any thread kind
  return PATIENT_VISIBLE_CONVERSATIONS.includes(type);
};

/** Stable, order-independent key for a 1:1 thread. */
conversationSchema.statics.buildDirectKey = function buildDirectKey(a, b) {
  return [String(a), String(b)].sort().join(':');
};

// --- Methods ---------------------------------------------------------------

conversationSchema.methods.hasParticipant = function hasParticipant(userId) {
  const target = String(userId);
  return this.participants.some((participant) => String(participant?._id ?? participant) === target);
};

/** Unread count is derived: messages newer than this user's `lastReadAt`. */
conversationSchema.methods.lastReadAtFor = function lastReadAtFor(userId) {
  const target = String(userId);
  const entry = this.reads.find((read) => String(read.user) === target);
  return entry ? entry.lastReadAt : null;
};

// --- Hooks -----------------------------------------------------------------

conversationSchema.pre('validate', function enforceShape(next) {
  // Duplicate participants would break unread bookkeeping and the direct-key
  // invariant, and are always a caller bug.
  const ids = this.participants.map(String);
  if (new Set(ids).size !== ids.length) {
    return next(new Error('Conversation participants must be unique'));
  }

  if (this.type === CONVERSATION_TYPE.CARE_TEAM && !this.patient) {
    return next(new Error('A care-team conversation must reference a patient'));
  }

  if (this.type === CONVERSATION_TYPE.DIRECT) {
    if (ids.length !== 2) {
      return next(new Error('A direct conversation must have exactly two participants'));
    }
    if (!this.directKey) {
      this.directKey = this.constructor.buildDirectKey(ids[0], ids[1]);
    }
  } else {
    // Only `direct` threads participate in the sparse-unique index.
    this.directKey = null;
  }

  if (this.type === CONVERSATION_TYPE.STAFF_ONLY && this.patient) {
    return next(new Error('A staff-only conversation must not reference a patient'));
  }

  // Every participant needs a read-state row so "mark read" is a positional
  // update rather than a read-modify-write.
  const tracked = new Set(this.reads.map((read) => String(read.user)));
  ids.forEach((id) => {
    if (!tracked.has(id)) this.reads.push({ user: id, lastReadAt: null });
  });

  return next();
});

module.exports = mongoose.model('Conversation', conversationSchema);
