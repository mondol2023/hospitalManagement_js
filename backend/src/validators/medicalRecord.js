'use strict';

const {
  z,
  objectId,
  objectIdOrSelf,
  idParam,
  listQuery,
  shortText,
  optionalText,
  dateValue,
  nonEmptyPatch,
} = require('./common');
const { vitals } = require('./vitals');

/**
 * The clinical encounter record.
 *
 * A prescription line is structured — medicine link, dosage, frequency, duration
 * — rather than the single free-text string the original schema used, which is
 * what lets the pharmacy act on it. Either a catalogue `medicine` or a `name` is
 * required: the first covers stocked drugs, the second an external prescription
 * the hospital does not dispense. The service resolves the link and copies the
 * canonical name in, so a later catalogue rename cannot rewrite history.
 */

const prescription = z
  .object({
    medicine: objectId.optional(),
    name: shortText(200).optional(),
    dosage: shortText(100),
    frequency: shortText(100).optional(),
    durationDays: z.coerce.number().int().min(1).max(365).optional(),
    instructions: optionalText(500),
  })
  .refine((line) => Boolean(line.medicine || line.name), {
    message: 'A prescription line needs a catalogue medicine or a name',
    path: ['name'],
  });

const prescriptions = z.array(prescription).max(50);

const attachment = z.object({
  url: z.string().trim().url().max(2048),
  label: shortText(200).optional(),
  mimeType: shortText(120).optional(),
});

const attachments = z.array(attachment).max(20);

const patientIdParam = z.object({ patientId: objectIdOrSelf });

const chart = {
  params: patientIdParam,
  query: listQuery({
    from: dateValue.optional(),
    to: dateValue.optional(),
  }),
};

const latest = { params: patientIdParam };

const listForDoctor = {
  params: z.object({ doctorUserId: objectId }),
  query: listQuery({}),
};

const myRecords = { query: listQuery({}) };

const byId = { params: idParam() };

const create = {
  body: z.object({
    patientId: objectId,
    appointmentId: objectId.optional(),
    visitDate: dateValue.optional(),
    chiefComplaint: optionalText(1000),
    diagnosis: shortText(2000),
    treatmentPlan: optionalText(5000),
    prescriptions: prescriptions.optional(),
    vitals: vitals.optional(),
    notes: optionalText(5000),
    attachments: attachments.optional(),
    followUpDate: dateValue.optional(),
  }),
};

/**
 * `patient`, `doctor` and `appointment` are absent by design — the service
 * whitelists the same fields. Moving a record to a different patient is not a
 * correction, it is a different record.
 */
const update = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      chiefComplaint: optionalText(1000),
      diagnosis: shortText(2000).optional(),
      treatmentPlan: optionalText(5000),
      prescriptions: prescriptions.optional(),
      vitals: vitals.optional(),
      notes: optionalText(5000),
      attachments: attachments.optional(),
      followUpDate: dateValue.optional(),
    })
  ),
};

const followUps = {
  query: z.object({ days: z.coerce.number().int().min(1).max(30).optional() }),
};

module.exports = {
  chart,
  latest,
  listForDoctor,
  myRecords,
  byId,
  create,
  update,
  followUps,
};
