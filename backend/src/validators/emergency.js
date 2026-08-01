'use strict';

const {
  z,
  objectId,
  idParam,
  listQuery,
  shortText,
  optionalText,
  longText,
  dateRange,
} = require('./common');
const {
  EMERGENCY_TYPE_VALUES,
  EMERGENCY_SEVERITY_VALUES,
  EMERGENCY_STATUS_VALUES,
} = require('../utils/constants');

/**
 * The alert channel.
 *
 * `raise` is the loosest schema in the codebase and that is intentional: every
 * field on it is optional. Somebody reporting a cardiac arrest is not going to
 * be told their report is malformed because they left the room number blank, and
 * the service treats an unknown `patientId` as a warning rather than a rejection
 * for the same reason. What is validated is only what would corrupt the board —
 * an unknown type or severity.
 */

const location = z.object({
  ward: shortText(60).optional(),
  floor: z.coerce.number().int().min(-10).max(200).optional(),
  room: shortText(60).optional(),
});

const raise = {
  body: z.object({
    type: z.enum(EMERGENCY_TYPE_VALUES).optional(),
    severity: z.enum(EMERGENCY_SEVERITY_VALUES).optional(),
    description: optionalText(2000),
    location: location.optional(),
    patientId: objectId.optional(),
  }),
};

const activeBoard = {
  query: listQuery({
    type: z.enum(EMERGENCY_TYPE_VALUES).optional(),
    severity: z.enum(EMERGENCY_SEVERITY_VALUES).optional(),
    ward: shortText(60).optional(),
  }),
};

const list = {
  query: listQuery({
    status: z.enum(EMERGENCY_STATUS_VALUES).optional(),
    type: z.enum(EMERGENCY_TYPE_VALUES).optional(),
    severity: z.enum(EMERGENCY_SEVERITY_VALUES).optional(),
    patientId: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

const listForPatient = {
  params: z.object({ patientId: objectId }),
  query: listQuery({}),
};

const byId = { params: idParam() };

const responseStats = { query: dateRange() };

/** Notes are mandatory: an alert closed in silence reads as one that was ignored. */
const resolve = {
  params: idParam(),
  body: z.object({ notes: longText(2000) }),
};

/** Severity only ever goes up; the service enforces the direction. */
const escalate = {
  params: idParam(),
  body: z.object({ severity: z.enum(EMERGENCY_SEVERITY_VALUES) }),
};

module.exports = {
  raise,
  activeBoard,
  list,
  listForPatient,
  byId,
  responseStats,
  resolve,
  escalate,
};
