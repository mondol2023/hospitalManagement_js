'use strict';

const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { ROLES, ROLE_VALUES } = require('../utils/constants');

/**
 * Role gates.
 *
 * Every guard here answers one question — "does this *kind* of user get to call
 * this endpoint at all?" — and nothing about a specific record. Row-level rules
 * ("is this your patient?") live in `careAccess` and, again, in the services;
 * mixing the two produces middleware that has to load documents and services
 * that trust the router.
 *
 * Role names are validated at construction time rather than at request time. A
 * typo like `authorize('pharmacy')` used to produce a route nobody could ever
 * reach, and it failed silently — the endpoint simply 403'd forever. Now it
 * throws at require-time, so the process refuses to boot.
 */

function assertKnownRoles(roles) {
  const unknown = roles.filter((role) => !ROLE_VALUES.includes(role));
  if (unknown.length) {
    throw new Error(
      `authorize(): unknown role(s) ${unknown.join(', ')}. Known roles: ${ROLE_VALUES.join(', ')}`
    );
  }
}

/**
 * Wraps a role predicate in the shared "must be authenticated first" check.
 *
 * Without the 401/403 split a signed-out caller gets told they lack permission,
 * which sends clients into a retry loop instead of a token refresh.
 */
function guard(predicate, message) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required', { code: 'TOKEN_MISSING' }));
    }
    if (!predicate(req.user, req)) {
      return next(ApiError.forbidden(message));
    }
    return next();
  };
}

/** Allow only these exact roles. */
function authorize(...roles) {
  const allowed = roles.flat();
  assertKnownRoles(allowed);
  return guard(
    (actor) => allowed.includes(actor.role),
    'Your role does not have access to this resource'
  );
}

/** Any hospital employee — i.e. anyone who is not a patient. */
const requireStaff = guard(
  (actor) => accessPolicy.isStaff(actor.role),
  'This resource is restricted to hospital staff'
);

/** Administrators and managers. */
const requireAdmin = guard(
  (actor) => accessPolicy.isAdmin(actor.role),
  'This resource is restricted to administrators'
);

/** Doctors and nurses — the roles that may touch a chart. */
const requireClinician = guard(
  (actor) => accessPolicy.isClinician(actor.role),
  'This resource is restricted to clinical staff'
);

/** Clinicians plus administrators: the clinical *read* tier. */
const requireCareReader = guard(
  (actor) => accessPolicy.canReadCareData(actor),
  'This resource is restricted to clinical staff'
);

/**
 * The caller is the user named in the route, or is staff.
 *
 * This is the guard for "/users/:userId/..." style routes where a patient may
 * read their own row. It compares against `req.user.id`, never against a body
 * field, so a caller cannot widen their own scope by posting someone else's id.
 */
function requireSelfOrStaff(param = 'userId') {
  return guard((actor, req) => {
    if (accessPolicy.isStaff(actor.role)) return true;
    return String(req.params?.[param] ?? '') === actor.id;
  }, 'You may only access your own records');
}

/** Strictly the named user — staff get no bypass. Used for credential changes. */
function requireSelf(param = 'userId') {
  return guard(
    (actor, req) => String(req.params?.[param] ?? '') === actor.id,
    'You may only modify your own account'
  );
}

/**
 * Blocks patients without enumerating staff roles.
 *
 * `requireStaff` already does this; the alias exists because several routes read
 * far more clearly as "not the patient" than as "every employee".
 */
const denyPatients = guard(
  (actor) => actor.role !== ROLES.PATIENT,
  'This resource is not available to patients'
);

module.exports = {
  authorize,
  requireStaff,
  requireAdmin,
  requireClinician,
  requireCareReader,
  requireSelfOrStaff,
  requireSelf,
  denyPatients,
  guard,
};
