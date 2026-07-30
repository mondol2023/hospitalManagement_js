'use strict';

/**
 * Express 4 does not catch rejections from async handlers — an awaited throw
 * becomes an unhandled rejection and the request hangs until the client times
 * out. Wrapping every async handler funnels rejections into `next()` so the
 * central error middleware answers the request.
 *
 * This removes the try/catch + `next(err)` boilerplate that was repeated in
 * every controller method (and forgotten in `authController.register`, where
 * `next` was not even a parameter).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
