'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const { BED_STATUS, BED_STATUS_VALUES } = require('../utils/constants');

/**
 * Fixes against the original `Bed.js`:
 *  - `patient` was `required: true`, meaning an unoccupied bed could not exist —
 *    the model contradicted the feature
 *  - the schema stored `isOccupied` (boolean) while `bedController` wrote a
 *    `status` string, so every status update was a silent no-op
 *  - `bedNumber` was not unique, so two beds could share a number in a ward
 */
const bedSchema = new mongoose.Schema(
  {
    bedNumber: { type: String, required: true, trim: true, uppercase: true },
    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    /** Pre-migration-002 text, kept for one release. */
    legacyWard: { type: String, trim: true, select: false },
    floor: { type: Number, min: 0 },
    type: {
      type: String,
      enum: ['general', 'icu', 'hdu', 'private', 'emergency'],
      default: 'general',
    },
    status: {
      type: String,
      enum: BED_STATUS_VALUES,
      default: BED_STATUS.AVAILABLE,
    },
    /** Null whenever the bed is not occupied — enforced by the hook below. */
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    occupiedAt: { type: Date, default: null },
    dailyRate: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

bedSchema.plugin(toJSONPlugin);
bedSchema.plugin(tenantScoped, { scope: 'branch' });

// --- Indexes ---------------------------------------------------------------
bedSchema.index({ organization: 1, branch: 1, ward: 1, bedNumber: 1 }, { unique: true });
// "How many free beds in the ICU?" — the hottest read on the ward dashboard.
bedSchema.index({ organization: 1, branch: 1, status: 1, ward: 1 });
bedSchema.index({ organization: 1, branch: 1, patient: 1 });

/**
 * Occupancy and patient assignment are two representations of one fact; keeping
 * them in sync here means no caller can produce an "occupied bed with no
 * patient" or "available bed still holding a patient" record.
 */
bedSchema.pre('validate', function syncOccupancy(next) {
  if (this.status === BED_STATUS.OCCUPIED) {
    if (!this.patient) {
      return next(new Error('An occupied bed must reference a patient'));
    }
    if (!this.occupiedAt) this.occupiedAt = new Date();
  } else {
    this.patient = null;
    this.occupiedAt = null;
  }
  return next();
});

bedSchema.virtual('isOccupied').get(function isOccupied() {
  return this.status === BED_STATUS.OCCUPIED;
});

module.exports = mongoose.model('Bed', bedSchema);
