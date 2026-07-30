'use strict';

const {
  z,
  objectId,
  objectIdOrSelf,
  idParam,
  listQuery,
  dateValue,
  optionalText,
  longText,
} = require('./common');
const { APPOINTMENT_STATUS_VALUES } = require('../utils/constants');

/**
 * `patientId` is optional on `book`: a patient booking for themselves does not
 * supply one, and the service refuses to *read* it from a patient's request
 * anyway. Declaring it optional here rather than forbidding it keeps one schema
 * for both callers, with the authority for "whose appointment is this" staying
 * in `appointmentService._resolvePatient`.
 */

const listFilters = {
  status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
  doctor: objectId.optional(),
  from: dateValue.optional(),
  to: dateValue.optional(),
};

const book = {
  body: z.object({
    patientId: objectId.optional(),
    doctorUserId: objectId,
    scheduledAt: dateValue,
    durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    reason: optionalText(1000),
  }),
};

const listMine = { query: listQuery(listFilters) };

const listForPatient = {
  params: z.object({ patientId: objectIdOrSelf }),
  query: listQuery(listFilters),
};

const listForDoctor = {
  params: z.object({ userId: objectId }),
  query: listQuery(listFilters),
};

const daySchedule = {
  params: z.object({ userId: objectId }),
  query: z.object({ date: dateValue.optional() }),
};

const byId = { params: idParam() };

const reschedule = {
  params: idParam(),
  body: z.object({
    scheduledAt: dateValue,
    durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
  }),
};

const cancel = {
  params: idParam(),
  body: z.object({ reason: optionalText(500) }),
};

const complete = {
  params: idParam(),
  body: z.object({ notes: longText(2000).optional() }),
};

module.exports = {
  book,
  listMine,
  listForPatient,
  listForDoctor,
  daySchedule,
  byId,
  reschedule,
  cancel,
  complete,
};
