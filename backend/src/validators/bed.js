'use strict';

const {
  z,
  objectId,
  idParam,
  listQuery,
  shortText,
  optionalText,
  nonEmptyPatch,
} = require('./common');
const { BED_STATUS, BED_STATUS_VALUES } = require('../utils/constants');

/**
 * Bed inventory and admission.
 *
 * `status` is accepted on the housekeeping endpoint only, and `occupied` is
 * excluded from it: a bed becomes occupied by admitting a patient, never by
 * setting a field. The service refuses it too — this schema simply makes the
 * refusal a 422 that names the allowed values.
 *
 * The bed types mirror `models/Bed.js`, which remains the authority.
 */

const BED_TYPES = ['general', 'icu', 'hdu', 'private', 'emergency'];

const HOUSEKEEPING_STATUSES = BED_STATUS_VALUES.filter(
  (status) => status !== BED_STATUS.OCCUPIED
);

const inventoryFields = {
  bedNumber: shortText(20),
  ward: shortText(60),
  floor: z.coerce.number().int().min(0).max(200).optional(),
  type: z.enum(BED_TYPES).optional(),
  dailyRate: z.coerce.number().min(0).max(1_000_000).optional(),
  notes: optionalText(500),
};

const list = {
  query: listQuery({
    search: shortText(120).optional(),
    ward: shortText(60).optional(),
    status: z.enum(BED_STATUS_VALUES).optional(),
    type: z.enum(BED_TYPES).optional(),
  }),
};

const available = {
  query: z.object({
    ward: shortText(60).optional(),
    type: z.enum(BED_TYPES).optional(),
  }),
};

const byId = { params: idParam() };

const create = { body: z.object(inventoryFields) };

const update = {
  params: idParam(),
  body: nonEmptyPatch(z.object(inventoryFields).partial()),
};

const setStatus = {
  params: idParam(),
  body: z.object({ status: z.enum(HOUSEKEEPING_STATUSES) }),
};

const assign = {
  params: idParam(),
  body: z.object({ patientId: objectId }),
};

/** Same shape as `assign`; the id in the path is the bed being moved *into*. */
const transfer = assign;

const release = { body: z.object({ patientId: objectId }) };

module.exports = {
  BED_TYPES,
  list,
  available,
  byId,
  create,
  update,
  setStatus,
  assign,
  transfer,
  release,
};
