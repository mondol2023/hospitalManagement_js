'use strict';

const {
  z,
  objectId,
  objectIdOrSelf,
  idParam,
  listQuery,
  shortText,
  optionalText,
  longText,
  dateValue,
  minorUnits,
} = require('./common');
const {
  CARE_LOG_TYPE_VALUES,
  MEDICATION_STATUS_VALUES,
  MEDICATION_ROUTE_VALUES,
  SERVICE_CATEGORY_VALUES,
} = require('../utils/constants');

/**
 * The bedside record.
 *
 * Vitals bounds are stated here as well as on the schema on purpose: a
 * respiratory rate of 400 should come back as a field-level 422 telling the
 * nurse which reading is wrong, not as a Mongoose cast error after the request
 * has already been authorised and the patient loaded. The two sets of limits are
 * the same numbers — `models/schemas/vitals.js` remains the authority, this is
 * the early exit.
 */

const patientIdParam = z.object({ patientId: objectIdOrSelf });

const vitals = z
  .object({
    temperatureC: z.coerce.number().min(25).max(45).optional(),
    heartRateBpm: z.coerce.number().int().min(20).max(300).optional(),
    systolicBp: z.coerce.number().int().min(40).max(300).optional(),
    diastolicBp: z.coerce.number().int().min(20).max(200).optional(),
    respiratoryRate: z.coerce.number().int().min(4).max(80).optional(),
    oxygenSaturation: z.coerce.number().min(50).max(100).optional(),
    weightKg: z.coerce.number().min(0).max(500).optional(),
    painScore: z.coerce.number().int().min(0).max(10).optional(),
    bloodGlucoseMgDl: z.coerce.number().min(10).max(1000).optional(),
  })
  // Mirrors the model's pre-validate hook: an observation with no observation in
  // it is a row that costs a query and tells a doctor nothing.
  .refine((reading) => Object.keys(reading).length > 0, {
    message: 'At least one reading is required',
  });

const administerMedication = {
  body: z.object({
    patientId: objectId,
    medicineId: objectId.optional(),
    name: shortText(200).optional(),
    dosage: shortText(100),
    route: z.enum(MEDICATION_ROUTE_VALUES).optional(),
    status: z.enum(MEDICATION_STATUS_VALUES).optional(),
    scheduledFor: dateValue.optional(),
    medicalRecordId: objectId.optional(),
    reason: optionalText(500),
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
    notes: optionalText(4000),
  }),
};

const recordVitals = {
  body: z.object({
    patientId: objectId,
    vitals,
    notes: optionalText(4000),
    performedAt: dateValue.optional(),
  }),
};

/** Services and procedures share a payload; only the log `type` differs. */
const logService = {
  body: z.object({
    patientId: objectId,
    category: z.enum(SERVICE_CATEGORY_VALUES),
    name: shortText(200),
    durationMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    chargeableCents: minorUnits.optional(),
    notes: optionalText(4000),
  }),
};

const logObservation = {
  body: z.object({
    patientId: objectId,
    notes: longText(4000),
    requiresAttention: z.boolean().optional(),
  }),
};

const handover = {
  body: z.object({
    patientId: objectId,
    toNurseUserId: objectId,
    summary: longText(4000),
    outstandingTasks: z.array(shortText(300)).max(50).optional(),
  }),
};

const timeline = {
  params: patientIdParam,
  query: listQuery({
    type: z.enum(CARE_LOG_TYPE_VALUES).optional(),
    from: dateValue.optional(),
    to: dateValue.optional(),
  }),
};

const latestVitals = { params: patientIdParam };

const wardFeed = {
  params: z.object({ ward: shortText(60) }),
  query: listQuery({ type: z.enum(CARE_LOG_TYPE_VALUES).optional() }),
};

const myEntries = { query: listQuery({ type: z.enum(CARE_LOG_TYPE_VALUES).optional() }) };

const attentionQueue = { query: listQuery({ ward: shortText(60).optional() }) };

const byId = { params: idParam() };

const acknowledge = {
  params: idParam(),
  body: z.object({ note: optionalText(2000) }),
};

/**
 * A correction is a new entry, so it carries the same payload as the original
 * plus the type it is replacing. The service supplies `patientId` and
 * `performedAt` from the superseded entry — a correction that could move the
 * event to a different patient or a different time would defeat the audit trail.
 */
const correct = {
  params: idParam(),
  body: z.object({
    type: z.enum(CARE_LOG_TYPE_VALUES).optional(),
    notes: optionalText(4000),
    vitals: vitals.optional(),
    medication: z
      .object({
        medicine: objectId.optional(),
        name: shortText(200),
        dosage: shortText(100),
        route: z.enum(MEDICATION_ROUTE_VALUES).optional(),
        status: z.enum(MEDICATION_STATUS_VALUES).optional(),
        scheduledFor: dateValue.optional(),
        reason: optionalText(500),
      })
      .optional(),
    service: z
      .object({
        category: z.enum(SERVICE_CATEGORY_VALUES),
        name: shortText(200),
        durationMinutes: z.coerce.number().int().min(0).max(1440).optional(),
        chargeableCents: minorUnits.optional(),
      })
      .optional(),
    requiresAttention: z.boolean().optional(),
  }),
};

module.exports = {
  administerMedication,
  recordVitals,
  logService,
  logObservation,
  handover,
  timeline,
  latestVitals,
  wardFeed,
  myEntries,
  attentionQueue,
  byId,
  acknowledge,
  correct,
};
