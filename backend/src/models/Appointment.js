'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const {
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_TRANSITIONS,
} = require('../utils/constants');

/**
 * Fixes against the original `Appointment.js`:
 *  - the model was registered as `'Appoinment'` (typo) while `Patient.bed` and
 *    the services referenced `'Appointment'`, so populate silently failed
 *  - `date: Date` + `time: String` cannot be compared, making overlap detection
 *    impossible; replaced with a single instant, `scheduledAt`
 *  - status enum was pending/approved/rejected, but controllers and clients used
 *    confirmed/cancelled/completed
 *  - nothing prevented booking the same doctor into the same slot twice
 */
const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, min: 5, max: 240, default: 30 },
    endsAt: { type: Date },
    status: {
      type: String,
      enum: APPOINTMENT_STATUS_VALUES,
      default: APPOINTMENT_STATUS.PENDING,
    },
    reason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

appointmentSchema.plugin(toJSONPlugin);
appointmentSchema.plugin(tenantScoped, { scope: 'branch' });

// --- Indexes ---------------------------------------------------------------
// Doctor's day view and clash detection.
appointmentSchema.index({ organization: 1, branch: 1, doctor: 1, scheduledAt: 1 });
// Patient's history, newest first.
appointmentSchema.index({ organization: 1, branch: 1, patient: 1, scheduledAt: -1 });
// Dashboard queries: "today's confirmed appointments".
appointmentSchema.index({ organization: 1, branch: 1, status: 1, scheduledAt: 1 });

/**
 * Database-level double-booking guard. Application checks race under concurrent
 * requests; this unique index is the authority. Scoped to live statuses so a
 * cancelled slot can be rebooked.
 */
appointmentSchema.index(
  { organization: 1, branch: 1, doctor: 1, scheduledAt: 1 },
  {
    unique: true,
    name: 'uniq_doctor_slot_active',
    partialFilterExpression: {
      status: { $in: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED] },
    },
  }
);

// --- Hooks -----------------------------------------------------------------

/** Keep `endsAt` consistent so overlap queries are pure range scans. */
appointmentSchema.pre('validate', function computeEnd(next) {
  if (this.scheduledAt && this.durationMinutes) {
    this.endsAt = new Date(this.scheduledAt.getTime() + this.durationMinutes * 60_000);
  }
  next();
});

// --- Statics / methods -----------------------------------------------------

/** Whether `next` is a legal successor of the current status. */
appointmentSchema.methods.canTransitionTo = function canTransitionTo(next) {
  return (APPOINTMENT_TRANSITIONS[this.status] || []).includes(next);
};

appointmentSchema.statics.isValidTransition = function isValidTransition(from, to) {
  return (APPOINTMENT_TRANSITIONS[from] || []).includes(to);
};

module.exports = mongoose.model('Appointment', appointmentSchema);
