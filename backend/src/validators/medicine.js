'use strict';

const {
  z,
  objectId,
  idParam,
  listQuery,
  shortText,
  optionalText,
  dateValue,
  boolish,
  nonEmptyPatch,
} = require('./common');

/**
 * Pharmacy inventory.
 *
 * `quantity` appears on `create` and nowhere else. Once a batch exists its count
 * moves only through restock / dispense / adjust, each of which is a single
 * atomic `$inc`; a PATCH that could set the number outright would overwrite
 * whatever movements landed in between and record no reason for the change. The
 * service refuses it as well — this schema strips it before the service ever
 * sees it.
 *
 * Unit values mirror `models/Medicine.js`, which remains the authority.
 */

const { STOCK_MOVEMENT_VALUES } = require('../utils/constants');

const UNITS = ['tablet', 'capsule', 'ml', 'mg', 'vial', 'strip', 'bottle'];

const units = z.coerce.number().int().min(0).max(1_000_000);

const catalogueFields = {
  name: shortText(200),
  genericName: shortText(200).optional(),
  batchNumber: shortText(60),
  category: shortText(120).optional(),
  unit: z.enum(UNITS).optional(),
  reorderLevel: units.optional(),
  price: z.coerce.number().min(0).max(1_000_000).optional(),
  manufacturer: shortText(200).optional(),
  expiryDate: dateValue,
  description: optionalText(1000),
  requiresPrescription: z.boolean().optional(),
};

const list = {
  query: listQuery({
    search: shortText(120).optional(),
    category: shortText(120).optional(),
    requiresPrescription: boolish.optional(),
    isActive: boolish.optional(),
    includeInactive: boolish.optional(),
  }),
};

const expiring = {
  query: z.object({ days: z.coerce.number().int().min(0).max(3650).optional() }),
};

const byId = { params: idParam() };

const movements = {
  query: listQuery({
    medicine: objectId.optional(),
    actor: objectId.optional(),
    kind: z.enum(STOCK_MOVEMENT_VALUES).optional(),
    from: dateValue.optional(),
    to: dateValue.optional(),
  }),
};

const stockReport = {
  query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }),
};

const create = {
  body: z.object({
    ...catalogueFields,
    // The opening count. Every later change is a movement, not an edit.
    quantity: units.optional(),
    price: z.coerce.number().min(0).max(1_000_000),
  }),
};

const update = {
  params: idParam(),
  body: nonEmptyPatch(
    z
      .object({ ...catalogueFields, isActive: z.boolean().optional() })
      .partial()
  ),
};

const restock = {
  params: idParam(),
  body: z.object({
    quantity: z.coerce.number().int().min(1).max(1_000_000),
  }),
};

const dispense = {
  params: idParam(),
  body: z.object({
    quantity: z.coerce.number().int().min(1).max(1_000_000),
    reason: optionalText(500),
  }),
};

/**
 * A stock-take correction. `delta` is signed and `reason` is mandatory — an
 * unexplained adjustment is indistinguishable from theft, so the requirement is
 * stated at the edge rather than discovered in the service.
 */
const adjust = {
  params: idParam(),
  body: z.object({
    delta: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, {
      message: 'An adjustment must be a non-zero whole number',
    }),
    reason: shortText(500),
  }),
};

module.exports = {
  UNITS,
  list,
  expiring,
  byId,
  movements,
  stockReport,
  create,
  update,
  restock,
  dispense,
  adjust,
};
