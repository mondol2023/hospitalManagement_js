'use strict';

/**
 * Operational (expected) errors carry an HTTP status and are safe to surface to
 * clients. Anything that is *not* an ApiError is treated by the error handler as
 * a programmer bug: logged with a stack, reported as a generic 500.
 *
 * This distinction is why the original `errorHandler` was dangerous — it echoed
 * `err.message` for every throw, leaking Mongo/driver internals to callers.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message client-safe message
   * @param {object} [options]
   * @param {string} [options.code] stable machine-readable code
   * @param {Array}  [options.details] field-level details (validation)
   * @param {Error}  [options.cause] underlying error, logged but never exposed
   */
  constructor(statusCode, message, { code, details, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || ApiError.defaultCodeFor(statusCode);
    this.details = details;
    this.isOperational = true;
    if (cause) this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }

  static defaultCodeFor(statusCode) {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHENTICATED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        422: 'VALIDATION_ERROR',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_ERROR',
        503: 'SERVICE_UNAVAILABLE',
      }[statusCode] || 'ERROR'
    );
  }

  static badRequest(message = 'Bad request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have permission to perform this action', options) {
    return new ApiError(403, message, options);
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, `${resource} not found`);
  }

  static conflict(message = 'Resource already exists', options) {
    return new ApiError(409, message, options);
  }

  static validation(message = 'Validation failed', details) {
    return new ApiError(422, message, { details });
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error', options) {
    return new ApiError(500, message, options);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', options) {
    return new ApiError(503, message, options);
  }
}

module.exports = ApiError;
