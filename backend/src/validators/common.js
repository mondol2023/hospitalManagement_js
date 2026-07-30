'use strict';

const mongoose = require('mongoose');
const { z } = require('zod');

const { PAGINATION } = require('../utils/constants');

/**
 * Building blocks shared by every request schema.
 *
 * Two rules hold across the whole validator layer:
 *
 *  1. **Every schema is an object schema.** Zod strips unknown keys from an
 *     object, so validation doubles as the mass-assignment defence — a field the
 *     endpoint did not declare cannot reach a service, let alone a `$set`.
 *  2. **Query schemas declare their filters.** `req.query` is replaced by the
 *     parsed result, so a filter that is not in the schema is silently dropped
 *     rather than silently trusted. `listQuery()` exists so the paging keys do
 *     not have to be repeated fifteen times.
 */

const objectId = z
  .string()
  .trim()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'must be a valid id');

/** `:patientId` accepts the `me` alias, which `loadPatient` resolves. */
const objectIdOrSelf = z
  .string()
  .trim()
  .refine((value) => value === 'me' || mongoose.Types.ObjectId.isValid(value), 'must be a valid id');

const idParam = (name = 'id') => z.object({ [name]: objectId });

const shortText = (max = 200) => z.string().trim().min(1).max(max);
const longText = (max = 5000) => z.string().trim().min(1).max(max);
const optionalText = (max = 2000) => z.string().trim().max(max).optional();

/** A date that arrives as an ISO string on a query string or JSON body. */
const dateValue = z.coerce.date();

/** Money crosses the wire in minor units — never as a float. */
const minorUnits = z.coerce.number().int().nonnegative().max(1_000_000_000);

const positiveInt = z.coerce.number().int().positive();

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

/**
 * Paging and sorting, plus whatever filters the endpoint declares.
 *
 * `limit` is capped here as well as in `parsePagination` so an out-of-range page
 * size is reported to the caller as a 422 instead of being quietly clamped.
 */
const listQuery = (shape = {}) =>
  z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(PAGINATION.MAX_LIMIT).optional(),
    sort: z.string().trim().max(120).optional(),
    ...shape,
  });

/** `?from=…&to=…`, rejected when the range runs backwards. */
const dateRange = (shape = {}) =>
  z
    .object({ from: dateValue.optional(), to: dateValue.optional(), ...shape })
    .refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: 'from must not be after to',
      path: ['from'],
    });

/** Rejects `{}` — a PATCH with nothing in it is a client bug, not a no-op. */
const nonEmptyPatch = (schema) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

module.exports = {
  z,
  objectId,
  objectIdOrSelf,
  idParam,
  shortText,
  longText,
  optionalText,
  dateValue,
  minorUnits,
  positiveInt,
  boolish,
  listQuery,
  dateRange,
  nonEmptyPatch,
};
