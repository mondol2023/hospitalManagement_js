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
const { vitals } = require('./vitals');

/**
 * The bedside record.
 *
 * The vitals shape lives in `validators/vitals.js` because the doctor's
 * encounter record stores the same readings through the same model schema, and
 * two copies of nine numeric bounds is exactly the kind of duplication that
 * drifts.
 */

const patientIdParam = z.object({ patientId: objectIdOrSelf });

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

const myEntries = {
  query: listQuery({
    type: z.enum(CARE_LOG_TYPE_VALUES).optional(),
    from: dateValue.optional(),
    to: dateValue.optional(),
  }),
};

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
 *
 * Every type-specific payload must be declared here, because this schema strips
 * what it does not name and the model then enforces the per-type required field
 * against whatever survived. Omitting `handover` made every handover correction
 * fail validation; omitting `bed` was quieter and worse — `careLogService.record`
 * falls back to the patient's *current* bed, so a bed-assignment correction
 * succeeded while silently restating the movement against the wrong bed.
 *
 * The payloads are nested to mirror the stored document, not the flat bodies the
 * create endpoints accept: a correction is written straight through to the model,
 * so `handover.toNurse` is the field here where `POST /care-logs/handover` takes
 * `toNurseUserId`. Server-derived fields (`stockDeducted`, `acceptedAt`) stay out
 * for the same reason they are absent from `medication` below — they are the
 * system's record of what happened, not the clinician's.
 */
const correct = {
  params: idParam(),
  body: z.object({
    type: z.enum(CARE_LOG_TYPE_VALUES).optional(),
    bed: objectId.optional(),
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
    handover: z
      .object({
        toNurse: objectId,
        summary: longText(4000),
        outstandingTasks: z.array(shortText(300)).max(50).optional(),
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
