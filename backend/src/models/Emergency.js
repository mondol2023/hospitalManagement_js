'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const {
  EMERGENCY_STATUS,
  EMERGENCY_STATUS_VALUES,
  EMERGENCY_TYPE_VALUES,
  EMERGENCY_SEVERITY,
  EMERGENCY_SEVERITY_VALUES,
} = require('../utils/constants');

/**
 * Fixes against the original `Emergency.js`:
 *  - `resolved: { type: boolean }` used the undefined lowercase identifier, so
 *    requiring this model threw `ReferenceError` and crashed the process at boot
 *  - the controller wrote a `status` field the schema did not declare, so
 *    resolving an alert did nothing
 *  - `type` was unconstrained free text despite a fixed set of alert types
 *  - there was no severity, no acknowledgement trail, and no index — yet this is
 *    the most latency-sensitive collection in the system
 */
const emergencySchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: { type: String, enum: EMERGENCY_TYPE_VALUES, required: true },
    severity: {
      type: String,
      enum: EMERGENCY_SEVERITY_VALUES,
      default: EMERGENCY_SEVERITY.HIGH,
    },
    status: {
      type: String,
      enum: EMERGENCY_STATUS_VALUES,
      default: EMERGENCY_STATUS.OPEN,
    },
    description: { type: String, trim: true, maxlength: 2000 },
    location: { ward: String, floor: Number, room: String },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

emergencySchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// The active-alerts board: open/acknowledged, most severe and most recent first.
emergencySchema.index({ status: 1, severity: 1, createdAt: -1 });
emergencySchema.index({ createdAt: -1 });

/** Stamp the audit trail whenever status advances. */
emergencySchema.pre('save', function stampTransition(next) {
  if (this.isModified('status')) {
    if (this.status === EMERGENCY_STATUS.ACKNOWLEDGED && !this.acknowledgedAt) {
      this.acknowledgedAt = new Date();
    }
    if (this.status === EMERGENCY_STATUS.RESOLVED && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
  }
  next();
});

/** Minutes from report to resolution — feeds the analytics dashboard. */
emergencySchema.virtual('responseTimeMinutes').get(function responseTime() {
  if (!this.resolvedAt || !this.createdAt) return null;
  return Math.round((this.resolvedAt - this.createdAt) / 60_000);
});

module.exports = mongoose.model('Emergency', emergencySchema);
