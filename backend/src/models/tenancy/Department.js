'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('../plugins/toJSON');
const tenantScoped = require('../plugins/tenantScoped');
const { DEPARTMENT_TYPE, DEPARTMENT_TYPE_VALUES } = require('../../utils/constants');

/**
 * A department of one branch. Organisation-scoped (a plain `branch` reference,
 * not the plugin's branch scope) so an admin can list departments of any branch
 * without widening reads.
 */
const departmentSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 16 },
    type: { type: String, enum: DEPARTMENT_TYPE_VALUES, default: DEPARTMENT_TYPE.CLINICAL },
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Plain string until Phase 2 introduces cost centres. */
    costCenter: { type: String, trim: true, maxlength: 64 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

departmentSchema.plugin(tenantScoped, { scope: 'organization' });
departmentSchema.plugin(toJSONPlugin);

departmentSchema.index({ organization: 1, branch: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);
