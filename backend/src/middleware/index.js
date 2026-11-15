'use strict';

/**
 * Middleware, in one place.
 *
 * Routers import from here so a route file reads as a sentence —
 * `router.post('/', authenticate, requireStaff, validate({ body }), handler)` —
 * rather than as five import lines. The order those names appear in a route is
 * the order the checks actually run, and that ordering is load-bearing:
 * `careAccess` needs `req.user`, so `authenticate` must precede it; `validate`
 * must precede any handler that reads `req.body`.
 */

const authenticate = require('./authenticate');
const authorize = require('./authorize');
const careAccess = require('./careAccess');
const errorHandler = require('./errorHandler');
const rateLimit = require('./rateLimit');
const requestContext = require('./requestContext');
const security = require('./security');
const upload = require('./upload');
const validate = require('./validate');

module.exports = {
  // auth
  authenticate: authenticate.authenticate,
  optionalAuthenticate: authenticate.optionalAuthenticate,
  createAuthenticator: authenticate.createAuthenticator,
  resolveActor: authenticate.resolveActor,

  // rbac
  authorize: authorize.authorize,
  requireStaff: authorize.requireStaff,
  requireAdmin: authorize.requireAdmin,
  requireClinician: authorize.requireClinician,
  requireCareReader: authorize.requireCareReader,
  requireSelfOrStaff: authorize.requireSelfOrStaff,
  requireSelf: authorize.requireSelf,
  denyPatients: authorize.denyPatients,

  // row-level patient access
  loadPatient: careAccess.loadPatient,
  requirePatientView: careAccess.requirePatientView,
  requireCareRead: careAccess.requireCareRead,
  requireCareWrite: careAccess.requireCareWrite,

  // request shape
  validate: validate.validate,
  requireObjectId: validate.requireObjectId,

  // throttling
  createLimiter: rateLimit.createLimiter,
  globalLimiter: rateLimit.globalLimiter,
  authLimiter: rateLimit.authLimiter,
  refreshLimiter: rateLimit.refreshLimiter,
  reportLimiter: rateLimit.reportLimiter,
  uploadLimiter: rateLimit.uploadLimiter,

  // uploads
  singleImage: upload.singleImage,
  manyScans: upload.manyScans,
  createUploader: upload.createUploader,

  // platform
  requestContext: requestContext.requestContext,
  corsMiddleware: security.corsMiddleware,
  helmetMiddleware: security.helmetMiddleware,
  sanitizeMiddleware: security.sanitizeMiddleware,
  hppMiddleware: security.hppMiddleware,
  errorHandler: errorHandler.errorHandler,
  notFoundHandler: errorHandler.notFoundHandler,
};
