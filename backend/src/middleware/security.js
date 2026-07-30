'use strict';

const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * HTTP hardening, assembled in one place so `app.js` reads as a pipeline rather
 * than a pile of third-party configuration.
 *
 * Each of these closes a hole the original app actually had: `cors()` with no
 * arguments (every origin, with credentials), no `helmet` at all, no protection
 * against `?role=patient&role=admin` parameter pollution, and query objects
 * passed straight into `Model.find()` where `{ "$ne": null }` is a valid filter.
 */

/**
 * Origin allow-list.
 *
 * `cors()` with no options reflects whatever `Origin` the browser sent, which
 * combined with `credentials: true` means any site can make authenticated calls
 * on a logged-in user's behalf. The list comes from `CORS_ORIGINS` and a request
 * from anywhere else is refused rather than silently unlabelled.
 *
 * Requests with no `Origin` header — server-to-server, curl, health checks,
 * same-origin navigations — are allowed through: CORS is a browser control, and
 * rejecting them would block monitoring while stopping nothing.
 */
function buildCorsOptions(origins = env.CORS_ORIGINS) {
  const allowed = new Set(origins);
  const allowAll = allowed.has('*');

  if (allowAll && env.isProduction) {
    throw new Error('CORS_ORIGINS may not be "*" in production');
  }

  return {
    origin(origin, callback) {
      if (!origin || allowAll || allowed.has(origin)) return callback(null, true);
      logger.warn('Blocked cross-origin request', { origin });
      return callback(ApiError.forbidden('Origin is not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  };
}

const corsMiddleware = () => cors(buildCorsOptions());

/**
 * Security headers.
 *
 * CSP is set to a deny-everything policy because this process serves JSON, not
 * pages — there is no legitimate script, style or frame to load. `crossOriginResourcePolicy`
 * is relaxed to `cross-origin` so a browser front-end on another origin can
 * actually read the responses it is allowed to make.
 */
const helmetMiddleware = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

/**
 * Strips Mongo operators (`$gt`, dotted paths) from anything caller-supplied.
 *
 * Defence in depth, not the primary control — the primary control is that every
 * endpoint validates with a zod schema that strips unknown keys, and that no
 * repository ever takes a filter straight from `req`. This exists because
 * "never" is a property of the code as it stands today, and one careless
 * `find(req.query)` in six months should not become a data breach.
 */
const sanitizeMiddleware = () =>
  mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      logger.warn('Stripped Mongo operator from request', {
        requestId: req.id,
        location: key,
        path: req.originalUrl,
      });
    },
  });

/**
 * Collapses repeated query parameters to a single value.
 *
 * Express turns `?status=paid&status=void` into an array, and downstream code
 * that expects a string then compares against `['paid','void']` — which fails
 * open surprisingly often. `whitelist` names the parameters where repetition is
 * genuinely meaningful.
 */
const hppMiddleware = () =>
  hpp({ whitelist: ['status', 'role', 'ward', 'type', 'metric', 'metrics', 'sort'] });

module.exports = {
  buildCorsOptions,
  corsMiddleware,
  helmetMiddleware,
  sanitizeMiddleware,
  hppMiddleware,
};
