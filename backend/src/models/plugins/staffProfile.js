'use strict';

const mongoose = require('mongoose');
const tenantScoped = require('./tenantScoped');
const { SHIFTS, SHIFT_VALUES } = require('../../utils/constants');

/**
 * The employment core shared by every staff profile (Doctor, Nurse, Staff).
 *
 * Each of those collections needs the same one-to-one link to a `User`, the same
 * unique employee number, the same department/shift/duty state and the same
 * lookup helpers. Expressing that once as a plugin is the DRY equivalent of a
 * base class, and keeps the profiles substitutable: any code that resolves
 * "which profile does this user have?" can call `findByUser` on any of them.
 *
 * @param {import('mongoose').Schema} schema
 * @param {{ defaultShift?: string }} [options]
 */
function staffProfilePlugin(schema, options = {}) {
  schema.add({
    /** One profile per user account; enforced by the unique index below. */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    /** Pre-migration-002 text, kept for one release. */
    legacyDepartment: { type: String, trim: true, select: false },
    shift: {
      type: String,
      enum: SHIFT_VALUES,
      default: options.defaultShift || SHIFTS.MORNING,
    },
    /**
     * Duty state, not a schedule. Rostering is a separate concern; this is the
     * flag the ward board and the on-call notification fan-out read.
     */
    isOnDuty: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  });

  schema.plugin(tenantScoped, { scope: 'organization' });
  schema.index({ organization: 1, user: 1 }, { unique: true });
  schema.index({ organization: 1, employeeId: 1 }, { unique: true });

  // "Who is on duty in the ICU right now?" — the roster board's only query.
  schema.index({ organization: 1, department: 1, isOnDuty: 1, isActive: 1 });

  /** Resolve a profile from the authenticated user id. */
  schema.statics.findByUser = function findByUser(userId) {
    return this.findOne({ user: userId });
  };

  /** Ids of everyone currently on duty, optionally scoped to a department. */
  schema.statics.onDutyUserIds = async function onDutyUserIds(department) {
    const filter = { isOnDuty: true, isActive: true };
    if (department) filter.department = department;
    const rows = await this.find(filter).select('user').lean();
    return rows.map((row) => row.user);
  };
}

module.exports = staffProfilePlugin;
