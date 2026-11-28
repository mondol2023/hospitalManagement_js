'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const staffProfilePlugin = require('./plugins/staffProfile');

/**
 * Professional profile for a user holding the `doctor` role.
 *
 * `employeeId` was not unique and there were no indexes; availability was stored
 * as free-form strings with no validation, so a slot of `{ start: 'banana' }`
 * was accepted. The employment fields (user link, employee id, department,
 * shift, duty state) now come from the shared staff-profile plugin, so Doctor,
 * Nurse and Staff cannot drift apart.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/; // 24h HH:mm

const timeSlotSchema = new mongoose.Schema(
  {
    start: { type: String, required: true, match: [TIME_PATTERN, 'Invalid start time'] },
    end: { type: String, required: true, match: [TIME_PATTERN, 'Invalid end time'] },
  },
  { _id: false }
);

timeSlotSchema.pre('validate', function ensureOrder(next) {
  if (this.start && this.end && this.start >= this.end) {
    // Lexicographic comparison is correct for zero-padded HH:mm.
    return next(new Error('Time slot end must be after start'));
  }
  return next();
});

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const doctorSchema = new mongoose.Schema(
  {
    specialization: { type: String, required: true, trim: true, index: true },
    qualifications: { type: String, required: true, trim: true },
    licenseNumber: { type: String, trim: true },
    experienceInYears: { type: Number, min: 0, max: 80, default: 0 },
    /** Minor units (cents), consistent with Bill — never floating point money. */
    consultationFeeCents: { type: Number, min: 0, default: 0 },
    availableDays: [{ type: String, enum: DAYS, lowercase: true }],
    timeSlots: [timeSlotSchema],
    /** Minutes per appointment; drives slot generation and clash detection. */
    slotDurationMinutes: { type: Number, min: 5, max: 240, default: 30 },
    isAcceptingPatients: { type: Boolean, default: true },
  },
  { timestamps: true }
);

doctorSchema.plugin(staffProfilePlugin);
doctorSchema.plugin(toJSONPlugin);

doctorSchema.index({ organization: 1, specialization: 1, isAcceptingPatients: 1 });
doctorSchema.index({ organization: 1, department: 1, isAcceptingPatients: 1 });

/** True when the doctor works on the weekday of `date`. */
doctorSchema.methods.worksOn = function worksOn(date) {
  if (!this.availableDays?.length) return true; // unconstrained
  const day = DAYS[(new Date(date).getUTCDay() + 6) % 7]; // JS: 0=Sunday
  return this.availableDays.includes(day);
};

module.exports = mongoose.model('Doctor', doctorSchema);
module.exports.DAYS = DAYS;
