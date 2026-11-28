'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const { BLOOD_GROUPS, GENDERS } = require('../utils/constants');

/**
 * Clinical profile attached to a `User` account.
 *
 * Fixes: gender excluded 'other'; `user` had no unique constraint so one account
 * could accumulate multiple patient profiles; no indexes existed on the fields
 * every query filters by.
 */
const patientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    medicalRecordNumber: {
      type: String,
      // Generated in a pre-validate hook; not supplied by clients.
      required: false,
      trim: true,
      uppercase: true,
    },
    dateOfBirth: { type: Date },
    age: {
      type: Number,
      required: true,
      min: [0, 'Age cannot be negative'],
      max: [150, 'Age is out of range'],
    },
    gender: { type: String, enum: GENDERS, required: true },
    address: { type: String, trim: true, maxlength: 500 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS },
    allergies: [{ type: String, trim: true }],
    chronicConditions: [{ type: String, trim: true }],
    emergencyContact: {
      name: { type: String, required: true, trim: true },
      relationship: { type: String, required: true, trim: true },
      phone: {
        type: String,
        required: true,
        trim: true,
        match: [/^\+?[0-9]{7,15}$/, 'Invalid emergency contact phone'],
      },
      email: { type: String, trim: true, lowercase: true },
    },
    primaryDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /**
     * Nurses responsible for this patient's bedside care. Membership is what
     * authorises writing to the patient's care log and joining their care-team
     * conversation, so it is modelled explicitly rather than inferred from
     * "whoever is on the ward right now".
     */
    assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    /** Denormalised from the assigned bed; scopes ward-level nurse queries. */
    ward: { type: String, trim: true },
    admittedAt: { type: Date },
    dischargedAt: { type: Date },
    medicalHistory: { type: String, maxlength: 5000 },
    isAdmitted: { type: Boolean, default: false },
    /** Branch where the patient registered; the patient itself belongs to the organisation. */
    registeredAtBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    /** Branch of the current admission; set on admit, cleared on discharge. */
    admittedBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

patientSchema.plugin(toJSONPlugin);
patientSchema.plugin(tenantScoped, { scope: 'organization' });

// --- Indexes ---------------------------------------------------------------
patientSchema.index({ organization: 1, user: 1 }, { unique: true });
patientSchema.index(
  { organization: 1, medicalRecordNumber: 1 },
  { unique: true, partialFilterExpression: { medicalRecordNumber: { $type: 'string' } } }
);
patientSchema.index({ organization: 1, primaryDoctor: 1, createdAt: -1 });
patientSchema.index({ organization: 1, isAdmitted: 1, admittedAt: -1 });
patientSchema.index({ organization: 1, admittedBranch: 1, isAdmitted: 1 });
patientSchema.index({ organization: 1, bloodGroup: 1 });
// A nurse's own patient list — multikey, and the first query of every shift.
patientSchema.index({ organization: 1, assignedNurses: 1, isAdmitted: 1 });
// The ward census board.
patientSchema.index({ organization: 1, ward: 1, isAdmitted: 1 });

/**
 * Human-facing record number. Uses a timestamp + random suffix rather than a
 * counter document, which would serialise every admission through a single hot
 * key — a real bottleneck at the target write volume.
 */
patientSchema.pre('validate', function generateMrn(next) {
  if (!this.medicalRecordNumber) {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 36 ** 4)
      .toString(36)
      .toUpperCase()
      .padStart(4, '0');
    this.medicalRecordNumber = `MRN-${stamp}-${random}`;
  }
  next();
});

/**
 * User ids of everyone clinically responsible for this patient: the primary
 * doctor plus the assigned nurses. This is the membership list for the
 * care-team conversation and the authorisation set for the care log, so it is
 * derived in one place instead of being reassembled by each caller.
 *
 * @returns {string[]}
 */
patientSchema.methods.careTeamUserIds = function careTeamUserIds() {
  const ids = [this.primaryDoctor, ...(this.assignedNurses || [])]
    .filter(Boolean)
    .map((id) => String(id._id ?? id));
  return [...new Set(ids)];
};

/** True when `userId` is the primary doctor or an assigned nurse. */
patientSchema.methods.isCareTeamMember = function isCareTeamMember(userId) {
  return this.careTeamUserIds().includes(String(userId));
};

module.exports = mongoose.model('Patient', patientSchema);
