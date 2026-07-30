'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const { buildVitalsSchema, isCritical } = require('./schemas/vitals');
const {
  CARE_LOG_TYPE,
  CARE_LOG_TYPE_VALUES,
  MEDICATION_STATUS,
  MEDICATION_STATUS_VALUES,
  MEDICATION_ROUTE,
  MEDICATION_ROUTE_VALUES,
  SERVICE_CATEGORY_VALUES,
  SHIFT_VALUES,
  CLINICAL_ROLES,
} = require('../utils/constants');

/**
 * The bedside record: everything a nurse does for an admitted patient.
 *
 * This is the missing half of the original system. It had a `MedicalRecord` for
 * the doctor's encounter note and nothing at all for the continuous care that
 * happens between encounters — no medication administration record, no service
 * log, no observation trail. A doctor reviewing a patient could see what was
 * *prescribed* but never what was actually *given*.
 *
 * ## Why one collection rather than four
 * A medication round, a set of observations, a delivered service and a bed
 * assignment are all the same event from the chart's point of view: "at time T,
 * clinician C did something for patient P". They are read together, in one
 * chronological timeline, far more often than they are read apart. Splitting
 * them across four collections would force a four-way merge on the hottest
 * clinical read in the system. They are discriminated by `type`, and the
 * per-type required fields are enforced in the pre-validate hook below.
 *
 * ## Visibility
 * Care logs are **staff-only**. Route-level RBAC restricts every endpoint on
 * this collection to `STAFF_ROLES`, and the care-team guard narrows clinical
 * writes to the doctor and nurses attached to the patient. A `patient` user has
 * no read path to this collection at all — their own view is the discharge
 * summary built from `MedicalRecord`.
 */

const medicationSchema = new mongoose.Schema(
  {
    /** Links the dose to inventory so stock can be decremented atomically. */
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    /** Denormalised so the chart stays readable if the catalogue entry changes. */
    name: { type: String, required: true, trim: true, maxlength: 200 },
    dosage: { type: String, required: true, trim: true, maxlength: 100 },
    route: {
      type: String,
      enum: MEDICATION_ROUTE_VALUES,
      default: MEDICATION_ROUTE.ORAL,
    },
    status: {
      type: String,
      enum: MEDICATION_STATUS_VALUES,
      default: MEDICATION_STATUS.ADMINISTERED,
      required: true,
    },
    /** When the dose was due; `performedAt` is when it actually happened. */
    scheduledFor: { type: Date },
    /** The chart entry this dose fulfils, when the order came from a doctor. */
    medicalRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRecord' },
    /** Mandatory for refused/missed/held — see the hook below. */
    reason: { type: String, trim: true, maxlength: 500 },
    /** Set once inventory has been decremented; makes the write idempotent. */
    stockDeducted: { type: Boolean, default: false },
  },
  { _id: false }
);

const serviceSchema = new mongoose.Schema(
  {
    category: { type: String, enum: SERVICE_CATEGORY_VALUES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    durationMinutes: { type: Number, min: 0, max: 1440 },
    /** Minor units. Non-zero services can be swept into the patient's bill. */
    chargeableCents: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const handoverSchema = new mongoose.Schema(
  {
    toNurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String, required: true, trim: true, maxlength: 4000 },
    outstandingTasks: [{ type: String, trim: true, maxlength: 300 }],
    acceptedAt: { type: Date },
  },
  { _id: false }
);

const careLogSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    /** Where the care happened. Null for an outpatient entry. */
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', default: null },
    /**
     * Denormalised from the bed. Ward-scoped feeds and the nurse ward-cover
     * check would otherwise need a join on every single read, and the ward a
     * log was written in is a historical fact that must not change when the
     * patient is later moved.
     */
    ward: { type: String, trim: true, index: true },
    type: { type: String, enum: CARE_LOG_TYPE_VALUES, required: true },

    /** Author. Every bedside entry is attributable — this is a legal record. */
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByRole: { type: String, enum: CLINICAL_ROLES, required: true },
    performedAt: { type: Date, required: true, default: Date.now },
    shift: { type: String, enum: SHIFT_VALUES },

    // --- Type-specific payloads (exactly one is populated) ------------------
    medication: { type: medicationSchema, default: undefined },
    vitals: { type: buildVitalsSchema(), default: undefined },
    service: { type: serviceSchema, default: undefined },
    handover: { type: handoverSchema, default: undefined },

    notes: { type: String, trim: true, maxlength: 4000 },
    attachments: [{ url: String, label: String, mimeType: String }],

    /**
     * Raised automatically for out-of-range vitals and non-administered doses,
     * or manually by the nurse. Drives the doctor's review queue.
     */
    requiresAttention: { type: Boolean, default: false },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    acknowledgementNote: { type: String, trim: true, maxlength: 2000 },

    /** Set when a chargeable service has been swept onto an invoice. */
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },

    /**
     * Clinical records are never hard-deleted. A correction supersedes the
     * original, and both stay in the timeline.
     */
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CareLog', default: null },
  },
  { timestamps: true }
);

careLogSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// The patient timeline — by far the hottest read, so it leads.
careLogSchema.index({ patient: 1, performedAt: -1 });
// The same timeline filtered to one kind, e.g. the medication chart alone.
careLogSchema.index({ patient: 1, type: 1, performedAt: -1 });
// The ward feed the nurses' station leaves open all shift.
careLogSchema.index({ ward: 1, performedAt: -1 });
// A nurse's own shift log ("what have I recorded today?").
careLogSchema.index({ recordedBy: 1, performedAt: -1 });
// The doctor's review queue. Partial, because the overwhelming majority of logs
// are never flagged — this index stays small even as the collection grows.
careLogSchema.index(
  { acknowledgedAt: 1, performedAt: -1 },
  { name: 'attention_queue', partialFilterExpression: { requiresAttention: true } }
);
// Due/overdue medication round.
careLogSchema.index(
  { 'medication.scheduledFor': 1 },
  {
    name: 'medication_due',
    partialFilterExpression: { 'medication.status': MEDICATION_STATUS.SCHEDULED },
  }
);
// Unbilled chargeable services, for the nightly billing sweep.
careLogSchema.index(
  { patient: 1, performedAt: 1 },
  { name: 'unbilled_services', partialFilterExpression: { bill: null } }
);

// --- Hooks -----------------------------------------------------------------

/**
 * Per-type required fields. A discriminated union needs its arms validated, or
 * "one collection for four event kinds" degrades into a bag of optional fields
 * where a medication entry with no medicine name is a legal document.
 */
careLogSchema.pre('validate', function validateByType(next) {
  // Mongoose surfaces an error thrown from a pre-validate hook as a validation
  // failure, which the error middleware maps to 400 — not 500.
  const fail = (message) => next(new mongoose.Error.ValidatorError({
    message,
    path: 'type',
    value: this.type,
  }));

  switch (this.type) {
    case CARE_LOG_TYPE.MEDICATION: {
      if (!this.medication) return fail('A medication log requires medication details');
      const status = this.medication.status;
      const needsReason = [
        MEDICATION_STATUS.REFUSED,
        MEDICATION_STATUS.MISSED,
        MEDICATION_STATUS.HELD,
      ].includes(status);
      if (needsReason && !this.medication.reason) {
        return fail(`A '${status}' dose requires a reason`);
      }
      break;
    }
    case CARE_LOG_TYPE.VITALS: {
      const vitals = typeof this.vitals?.toObject === 'function' ? this.vitals.toObject() : this.vitals;
      const readings = vitals ? Object.values(vitals) : [];
      if (!readings.some((value) => typeof value === 'number')) {
        return fail('A vitals log requires at least one reading');
      }
      break;
    }
    case CARE_LOG_TYPE.SERVICE:
    case CARE_LOG_TYPE.PROCEDURE: {
      if (!this.service) return fail(`A ${this.type} log requires service details`);
      break;
    }
    case CARE_LOG_TYPE.BED_ASSIGNMENT: {
      if (!this.bed) return fail('A bed assignment log requires a bed');
      break;
    }
    case CARE_LOG_TYPE.HANDOVER: {
      if (!this.handover) return fail('A handover log requires handover details');
      break;
    }
    case CARE_LOG_TYPE.OBSERVATION: {
      if (!this.notes) return fail('An observation log requires notes');
      break;
    }
    default:
      break;
  }
  return next();
});

/**
 * Auto-escalate. The point of recording vitals at the bedside is that somebody
 * acts on them; leaving escalation to whoever next opens the chart is how
 * deterioration gets missed. Raising the flag here means every write path —
 * REST, socket, seed script — escalates identically.
 */
careLogSchema.pre('validate', function autoFlag(next) {
  if (this.type === CARE_LOG_TYPE.VITALS && isCritical(this.vitals)) {
    this.requiresAttention = true;
  }
  if (
    this.type === CARE_LOG_TYPE.MEDICATION &&
    this.medication &&
    [MEDICATION_STATUS.REFUSED, MEDICATION_STATUS.MISSED].includes(this.medication.status)
  ) {
    this.requiresAttention = true;
  }
  next();
});

/** Keep the acknowledgement timestamp consistent with the acknowledger. */
careLogSchema.pre('save', function stampAcknowledgement(next) {
  if (this.isModified('acknowledgedBy') && this.acknowledgedBy && !this.acknowledgedAt) {
    this.acknowledgedAt = new Date();
  }
  next();
});

// --- Virtuals & helpers -----------------------------------------------------

careLogSchema.virtual('isAcknowledged').get(function isAcknowledged() {
  return Boolean(this.acknowledgedAt);
});

/** Chargeable, delivered and not yet invoiced. */
careLogSchema.virtual('isBillable').get(function isBillable() {
  return Boolean(this.service?.chargeableCents) && !this.bill;
});

module.exports = mongoose.model('CareLog', careLogSchema);
