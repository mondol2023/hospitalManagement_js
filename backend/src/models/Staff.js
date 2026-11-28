'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const staffProfilePlugin = require('./plugins/staffProfile');
const { ROLES } = require('../utils/constants');

/**
 * Profile for non-clinical hospital employees — receptionists, pharmacists,
 * accountants, managers and admins.
 *
 * The original codebase had no such record at all: a `pharmacist` was a bare
 * `User` row with no employee number, no department and nothing to attach an
 * audit trail to, which is why the medicine routes could grant a role that no
 * account could hold. Non-clinical staff share the messaging and directory
 * surface with clinicians, so they need a real profile.
 *
 * Clinical staff live in `Doctor`/`Nurse` because they carry clinical fields
 * (specialization, licence, ward cover) that would be dead weight here — one
 * table per meaningfully different shape, rather than a wide nullable one.
 */
const staffSchema = new mongoose.Schema(
  {
    /** Job title as printed on the badge, e.g. "Front Desk Supervisor". */
    designation: { type: String, required: true, trim: true, maxlength: 120 },
    /**
     * The account role this profile backs. Kept alongside `User.role` so the
     * staff directory can be filtered without a join on every listing.
     */
    role: {
      type: String,
      required: true,
      enum: [
        ROLES.RECEPTIONIST,
        ROLES.PHARMACIST,
        ROLES.ACCOUNTANT,
        ROLES.MANAGER,
        ROLES.ADMIN,
      ],
    },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'contract', 'intern'],
      default: 'full_time',
    },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Minor units, like every other money field in the system. */
    salaryCents: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

staffSchema.plugin(staffProfilePlugin);
staffSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// The staff directory: filter by role, then by department.
staffSchema.index({ organization: 1, role: 1, isActive: 1 });
staffSchema.index({ organization: 1, reportsTo: 1 });

module.exports = mongoose.model('Staff', staffSchema);
