'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('../plugins/toJSON');
const tenantScoped = require('../plugins/tenantScoped');
const { BRANCH_TYPE, BRANCH_TYPE_VALUES } = require('../../utils/constants');

/** A physical site of an organisation. Organisation-scoped: staff see their memberships via `User.branches`. */
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 16, immutable: true },
    type: { type: String, enum: BRANCH_TYPE_VALUES, default: BRANCH_TYPE.HOSPITAL },
    address: { type: String, trim: true, maxlength: 500 },
    phone: { type: String, trim: true, maxlength: 32 },
    timezone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isHeadOffice: { type: Boolean, default: false },
  },
  { timestamps: true }
);

branchSchema.plugin(tenantScoped, { scope: 'organization' });
branchSchema.plugin(toJSONPlugin);

branchSchema.index({ organization: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.Branch || mongoose.model('Branch', branchSchema);
