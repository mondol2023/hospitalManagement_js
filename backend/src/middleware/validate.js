'use strict';

const mongoose = require('mongoose');
const { ZodError } = require('zod');

const ApiError = require('../utils/ApiError');

/**
 * Schema validation at the edge.
 *
 * Two jobs, and the second one matters more than it looks:
 *
 *  1. **Reject malformed input** with a 422 that names the offending fields,
 *     instead of letting it reach Mongoose and come back as a driver error.
 *  2. **Replace the request segment with the parsed result.** Zod object schemas
 *     strip unknown keys, so `req.body` after validation contains *only* the
 *     fields the endpoint declared. That is the mass-assignment defence: a
 *     caller can post `{ name, role: 'admin' }` all they like — `role` never
 *     reaches the service because it was never in the schema.
 *
 * Point 2 is also why the parsed value is written back rather than parked on
 * `req.validated`. A controller that reads `req.body` — the obvious thing to
 * write — must get the safe object, not the raw one. `req.validated` exists as
 * well, but only as a convenience alias.
 *
 * Coercion (`z.coerce.number()`, `z.coerce.date()`) is the intended way to
 * handle query strings, where everything arrives as text. That keeps the "is
 * this a number?" question in the schema instead of scattered `parseInt` calls
 * in controllers.
 */

const SEGMENTS = Object.freeze(['body', 'params', 'query', 'headers']);

/**
 * Express 4 exposes `req.query` through a prototype getter. Plain assignment
 * happens to work there, but it throws under Express 5 and under any future
 * accessor-only definition — so fall back to defining an own property rather
 * than silently leaving the unvalidated value in place.
 */
function assignSegment(req, segment, value) {
  try {
    req[segment] = value;
  } catch {
    Object.defineProperty(req, segment, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

/** Flattens a ZodError into the `details` array the error envelope carries. */
function toDetails(error, segment) {
  return error.issues.map((issue) => ({
    field: [segment, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * @param {object} schemas zod schemas keyed by request segment, e.g.
 *   `{ body: z.object({...}), params: z.object({...}) }`. Unlisted segments are
 *   left untouched.
 */
function validate(schemas = {}) {
  const active = SEGMENTS.filter((segment) => schemas[segment]);

  if (!active.length) {
    throw new Error('validate(): no schema supplied for body, params, query or headers');
  }

  return function validateMiddleware(req, res, next) {
    const details = [];

    for (const segment of active) {
      const result = schemas[segment].safeParse(req[segment]);
      if (result.success) {
        // Headers are read-only in spirit and other middleware reads them by
        // name; validate them, but never swap the object out.
        if (segment !== 'headers') assignSegment(req, segment, result.data);
        req.validated = { ...(req.validated || {}), [segment]: result.data };
      } else {
        details.push(...toDetails(result.error, segment));
      }
    }

    // Every segment is checked before failing, so a client fixing a bad request
    // sees all of its problems at once rather than one round trip per field.
    if (details.length) {
      return next(ApiError.validation('Request validation failed', details));
    }
    return next();
  };
}

/**
 * Guards `:id`-style parameters before they reach a query.
 *
 * Without it an id like `abc` becomes a Mongoose CastError deep inside a
 * repository, which is a 500-shaped failure for what is plainly a 400.
 */
function requireObjectId(...params) {
  const names = params.flat();
  const checked = names.length ? names : ['id'];

  return function objectIdMiddleware(req, res, next) {
    const details = checked
      .filter((name) => !mongoose.Types.ObjectId.isValid(String(req.params?.[name] ?? '')))
      .map((name) => ({ field: `params.${name}`, message: 'must be a valid id', code: 'invalid_id' }));

    if (details.length) {
      return next(ApiError.validation('Invalid identifier', details));
    }
    return next();
  };
}

module.exports = validate;
module.exports.validate = validate;
module.exports.requireObjectId = requireObjectId;
module.exports.toDetails = toDetails;
module.exports.ZodError = ZodError;
