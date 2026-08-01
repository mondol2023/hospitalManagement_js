'use strict';

const mongoose = require('mongoose');
const multer = require('multer');
const { ZodError } = require('zod');

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { toDetails } = require('./validate');
const { elapsedMs } = require('./requestContext');

/**
 * The single exit point for every failure in the API.
 *
 * The original handler did `res.status(err.statusCode || 500).json({ message:
 * err.message })`, which is two bugs wearing a trenchcoat. First, it echoed the
 * message of *any* throw — Mongoose validator text, driver errors with
 * connection strings, `TypeError: Cannot read properties of undefined` — straight
 * to the client. Second, an error with no `statusCode` (that is: every genuine
 * bug) still rendered as a normal-looking JSON body, so monitoring saw a 500 with
 * a plausible message and nobody looked.
 *
 * The rule here: an error is either **operational** — anticipated, described by
 * an `ApiError`, safe to explain — or it is a **defect**, in which case the
 * client is told "internal error" and the details go to the log with a stack and
 * the request id. Everything in between is a translation problem, which is what
 * `normalise()` is for: known library error shapes are mapped to the operational
 * form deliberately, one at a time, rather than by trusting whatever `err.message`
 * happens to say.
 */

const DUPLICATE_KEY = 11000;

/** Renders Mongoose's per-path validator failures in the same shape zod uses. */
function mongooseValidationDetails(error) {
  return Object.values(error.errors || {}).map((issue) => ({
    field: issue.path,
    message: issue.message,
    code: issue.kind || 'invalid',
  }));
}

/**
 * Maps a known error shape on to an `ApiError`.
 *
 * Anything that falls through is returned as-is and treated as a defect by the
 * handler. Adding a case here is a deliberate act: it asserts that this failure
 * is expected and that its message is safe to show a caller.
 */
function normalise(err) {
  if (err instanceof ApiError) return err;

  // --- Validation -----------------------------------------------------------

  if (err instanceof ZodError) {
    return ApiError.validation('Request validation failed', toDetails(err, 'body'));
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.validation('Validation failed', mongooseValidationDetails(err));
  }

  /**
   * A *single* validator failure, which is a different type from the collection
   * above and — importantly — not an instance of it. This is what a `pre-validate`
   * hook produces when it rejects a document by hand, as `CareLog` does for its
   * per-type required fields. Without this case those rules fell through to the
   * defect branch, so "a refused dose requires a reason" reached the nurse as
   * `500 Internal server error` with the actual reason only in the server log.
   */
  if (err instanceof mongoose.Error.ValidatorError) {
    return ApiError.validation('Validation failed', [
      { field: err.path, message: err.message, code: err.kind || 'invalid' },
    ]);
  }

  if (err instanceof mongoose.Error.CastError) {
    // Only the path is echoed; `err.value` is caller-supplied and printing it
    // back is a small reflected-content foothold for no benefit.
    return ApiError.badRequest(`Invalid value for '${err.path}'`, {
      code: 'INVALID_VALUE',
      cause: err,
    });
  }

  // --- Concurrency and uniqueness ------------------------------------------

  if (err.code === DUPLICATE_KEY || err.code === 11001) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    const label = fields.length ? fields.join(', ') : 'value';
    return ApiError.conflict(`A record with this ${label} already exists`, {
      code: 'DUPLICATE_KEY',
      cause: err,
    });
  }

  if (err instanceof mongoose.Error.VersionError) {
    // Optimistic concurrency lost a race — genuinely retryable by the client.
    return new ApiError(409, 'This record was modified by someone else. Please retry.', {
      code: 'CONCURRENT_MODIFICATION',
      cause: err,
    });
  }

  if (err instanceof mongoose.Error.DocumentNotFoundError) {
    return ApiError.notFound('Record');
  }

  // Transient transaction/write conflicts, surfaced when a retry loop gave up.
  if (err.errorLabels?.includes?.('TransientTransactionError')) {
    return ApiError.conflict('The operation conflicted with a concurrent change. Please retry.', {
      code: 'WRITE_CONFLICT',
      cause: err,
    });
  }

  // --- Auth -----------------------------------------------------------------

  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token expired', { code: 'TOKEN_EXPIRED', cause: err });
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID', cause: err });
  }

  // --- Request body / uploads ----------------------------------------------

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, `File exceeds the ${env.UPLOAD_MAX_BYTES} byte limit`, {
        code: 'FILE_TOO_LARGE',
        cause: err,
      });
    }
    return ApiError.badRequest(`Upload rejected: ${err.code}`, {
      code: err.code,
      cause: err,
    });
  }

  // body-parser attaches `type`; without this a malformed JSON body is a 500.
  if (err.type === 'entity.too.large') {
    return new ApiError(413, `Request body exceeds the ${env.BODY_LIMIT} limit`, {
      code: 'PAYLOAD_TOO_LARGE',
      cause: err,
    });
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return ApiError.badRequest('Request body is not valid JSON', {
      code: 'MALFORMED_JSON',
      cause: err,
    });
  }
  if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
    return ApiError.badRequest('Unsupported request encoding', { cause: err });
  }

  // --- Infrastructure -------------------------------------------------------

  if (err instanceof mongoose.Error.MongooseServerSelectionError || err.name === 'MongoNetworkError') {
    return ApiError.serviceUnavailable('The service is temporarily unavailable', {
      code: 'DATABASE_UNAVAILABLE',
      cause: err,
    });
  }

  return err;
}

/** 404 for routes that matched nothing. Must be mounted after every router. */
function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Cannot ${req.method} ${req.originalUrl}`, { code: 'ROUTE_NOT_FOUND' }));
}

/* eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity */
function errorHandler(err, req, res, next) {
  const normalised = normalise(err);
  const isOperational = normalised instanceof ApiError;
  const statusCode = isOperational ? normalised.statusCode : 500;

  const context = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    userId: req.user?.id,
    durationMs: elapsedMs(req),
  };

  if (isOperational && statusCode < 500) {
    // Expected outcomes: worth counting, not worth a stack trace.
    logger.warn(normalised.message, { ...context, code: normalised.code });
  } else {
    // A defect, or a 5xx we anticipated. `cause` carries the original when an
    // ApiError wrapped one, and it is the only place the real error survives.
    logger.error(normalised.message, {
      ...context,
      code: isOperational ? normalised.code : 'INTERNAL_ERROR',
      stack: (normalised.cause || normalised).stack,
    });
  }

  // Streaming had already begun — the status line is long gone, so the only
  // honest thing left is to abort the response rather than append JSON to it.
  if (res.headersSent) return next(err);

  const body = {
    success: false,
    error: {
      code: isOperational ? normalised.code : 'INTERNAL_ERROR',
      message: isOperational ? normalised.message : 'Internal server error',
      requestId: req.id,
    },
  };

  if (isOperational && normalised.details) body.error.details = normalised.details;

  // Stacks are a development aid and a production disclosure. Never in prod.
  if (!env.isProduction && !isOperational) body.error.stack = normalised.stack;

  return res.status(statusCode).json(body);
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
module.exports.normalise = normalise;
