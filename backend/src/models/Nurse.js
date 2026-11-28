'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const staffProfilePlugin = require('./plugins/staffProfile');

/**
 * Professional profile for a user holding the `nurse` role.
 *
 * Nurses are the primary authors of bedside data in this system: they admit
 * patients to beds, run the medication round and record the services delivered
 * on a shift. Their profile therefore carries a **ward assignment**, which is
 * the scope check used when a nurse touches a patient's care log — a nurse acts
 * on the wards they are assigned to, not on the whole hospital.
 *
 * The employment core (user link, employeeId, department, shift, duty state)
 * comes from the shared staff-profile plugin.
 */
const nurseSchema = new mongoose.Schema(
  {
    /**
     * Wards this nurse covers. Empty means "not ward-restricted" (e.g. a float
     * nurse or a nurse manager) — the service layer treats that as hospital-wide.
     */
    assignedWards: [{ type: String, trim: true }],
    qualifications: { type: String, required: true, trim: true },
    licenseNumber: { type: String, trim: true },
    experienceInYears: { type: Number, min: 0, max: 60, default: 0 },
    /** Seniority gates who may sign off a handover or supervise a round. */
    grade: {
      type: String,
      enum: ['trainee', 'staff_nurse', 'senior_nurse', 'head_nurse'],
      default: 'staff_nurse',
    },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Soft ceiling used by the assignment service when spreading workload. */
    maxPatients: { type: Number, min: 1, max: 60, default: 12 },
  },
  { timestamps: true }
);

nurseSchema.plugin(staffProfilePlugin);
nurseSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// "Which nurses cover ward X and are on duty?" — multikey on assignedWards.
// This is the fan-out query for every bedside alert, so it must not scan.
nurseSchema.index({ organization: 1, assignedWards: 1, isOnDuty: 1, isActive: 1 });
nurseSchema.index({ organization: 1, grade: 1 });

/**
 * A nurse with no ward assignment is unrestricted; otherwise the ward must be
 * one they cover. Centralised here so the care-log, bed and handover services
 * all apply an identical rule.
 *
 * @param {string} ward
 */
nurseSchema.methods.covers = function covers(ward) {
  if (!this.assignedWards?.length) return true;
  if (!ward) return false;
  return this.assignedWards.some((w) => w.toLowerCase() === String(ward).toLowerCase());
};

/** On-duty nurses covering a ward (or every on-duty nurse when ward is falsy). */
nurseSchema.statics.onDutyForWard = function onDutyForWard(ward) {
  const filter = { isOnDuty: true, isActive: true };
  if (ward) filter.assignedWards = ward;
  return this.find(filter).select('user assignedWards').lean();
};

module.exports = mongoose.model('Nurse', nurseSchema);
