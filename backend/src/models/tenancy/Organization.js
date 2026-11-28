'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('../plugins/toJSON');
const {
  ORGANIZATION_STATUS,
  ORGANIZATION_STATUS_VALUES,
  ORGANIZATION_PLAN_VALUES,
  RESERVED_SUBDOMAINS,
} = require('../../utils/constants');

/**
 * The tenant itself. Deliberately NOT `tenantScoped`: it is the thing the
 * plugin scopes by, and platform code (login resolution, the status check)
 * must be able to read it without an active tenant.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: [2, 'code must be 2-8 characters'],
      maxlength: [8, 'code must be 2-8 characters'],
      immutable: true,
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]{2,40}$/, 'subdomain must be 2-40 characters of a-z, 0-9 or -'],
      validate: {
        validator: (value) => !RESERVED_SUBDOMAINS.includes(value),
        message: 'subdomain is reserved',
      },
    },
    status: { type: String, enum: ORGANIZATION_STATUS_VALUES, default: ORGANIZATION_STATUS.TRIAL },
    plan: { type: String, enum: ORGANIZATION_PLAN_VALUES, default: 'starter' },
    country: { type: String, default: 'BD' },
    timezone: { type: String, default: 'Asia/Dhaka' },
    currency: { type: String, default: 'BDT' },
    locale: { type: String, default: 'en' },
    /** Where patient self-registration lands; the active branch of patient tokens. */
    defaultRegistrationBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    /** Reserved; Phase 0B replaces it with a Setting collection. */
    settings: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ subdomain: 1 }, { unique: true, sparse: true });

organizationSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
