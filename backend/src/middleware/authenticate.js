'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userRepository = require('../repositories/userRepository');
const tokenService = require('../services/tokenService');
const organizationStatus = require('../services/organizationStatus');
const context = require('../utils/context');
const { ContextMissingError } = require('../utils/tenantErrors');
const { ROLES } = require('../utils/constants');

const { TokenService } = tokenService;

/**
 * Turns a bearer token into `req.user`.
 *
 * Three things happen here that the original `protect` middleware did not do,
 * and each of them was a real hole:
 *
 *  - **The user is re-read from the database on every request.** The old code
 *    trusted the role baked into the JWT, so demoting an admin did nothing until
 *    their token expired. The token proves *who* you are; the database decides
 *    *what* you are.
 *  - **Deactivated accounts are rejected.** `findActiveById` filters on
 *    `isActive`, so a suspended employee's outstanding token stops working the
 *    moment the flag flips, without waiting for expiry.
 *  - **`tokensValidFrom` is honoured.** That is what makes "log out everywhere"
 *    and "password changed" actually invalidate sessions, and it works with
 *    Redis down because the watermark lives in Mongo.
 *
 * The projection is deliberately narrow (`findActiveById` selects five fields):
 * this query runs on literally every authenticated request, so it must stay a
 * covered-ish point lookup rather than a full document fetch.
 */

const BEARER = /^Bearer[ \t]+(\S+)$/i;

/**
 * Reads the credential from the request.
 *
 * Only the Authorization header is accepted. Tokens in query strings were
 * supported by the original code and are a leak by construction — they land in
 * access logs, proxy logs and `Referer` headers.
 */
function extractToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = BEARER.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Verifies a token and resolves the acting user.
 *
 * Exported because the socket.io gateway authenticates handshakes with the same
 * rules — a second, slightly different implementation there is exactly how a
 * REST endpoint ends up locked and its websocket equivalent open.
 *
 * @returns {Promise<object>} actor: `{ id, _id, name, email, role, tokenId }`
 * @throws {ApiError} 401 for every rejection reason, with a distinct `code`
 */
async function resolveActor(
  token,
  { tokens = tokenService, users = userRepository, orgs = organizationStatus, allowPlatform = true } = {}
) {
  const payload = tokens.verifyAccessToken(token);

  // The one unscoped read on the request path: the token names the user by
  // globally unique id, and the org claim below binds it to a tenant.
  const { user, org } = await context.withoutTenant('auth:resolve-actor', async () => {
    const found = await users.findActiveById(payload.sub);
    if (!found) return {};
    return { user: found, org: found.organization ? await orgs.getInfo(found.organization) : null };
  });

  if (!user) {
    // Deleted or deactivated. Deliberately not distinguished from "bad token":
    // the difference is only useful to someone probing for valid accounts.
    throw ApiError.unauthorized('Session is no longer valid', { code: 'ACCOUNT_INACTIVE' });
  }

  if (TokenService.isStale(payload, user.tokensValidFrom)) {
    throw ApiError.unauthorized('Session has been revoked, please sign in again', {
      code: 'TOKEN_REVOKED',
    });
  }

  const userOrg = user.organization ? String(user.organization) : null;
  if ((payload.org ? String(payload.org) : null) !== userOrg) {
    throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID' });
  }

  const isPlatform = user.role === ROLES.PLATFORM_ADMIN;
  // Runs with the tenant filter off, so only /platform/* may accept this actor.
  if (isPlatform && !allowPlatform) {
    throw ApiError.forbidden('Platform administrators can only use /platform routes');
  }
  if (!isPlatform && (!org || org.status === 'suspended')) {
    throw ApiError.forbidden('This organization is suspended', { code: 'ORGANIZATION_SUSPENDED' });
  }

  const branchIds = (user.branches || []).map(String);
  const isPatient = user.role === ROLES.PATIENT;
  const pick = (...ids) => ids.find(Boolean);
  let branchId = null;
  if (isPatient) {
    branchId = pick(payload.br, org?.defaultRegistrationBranch, user.defaultBranch);
  } else if (!isPlatform) {
    branchId = pick(payload.br, user.lastActiveBranch, user.defaultBranch);
    if (!branchId || !branchIds.includes(String(branchId))) {
      throw ApiError.forbidden('Access to this branch has been revoked', {
        code: 'BRANCH_ACCESS_REVOKED',
      });
    }
  }
  branchId = branchId ? String(branchId) : null;

  const actor = {
    id: String(user._id),
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenId: payload.jti,
    organizationId: userOrg,
    branchId,
    branchIds,
  };

  try {
    context.set(tenantStoreFor(actor));
  } catch (error) {
    // Socket handshakes have no store; their handlers bind one per event.
    if (!(error instanceof ContextMissingError)) throw error;
  }

  return actor;
}

/** Tenant fields of the context store for an authenticated actor (HTTP and sockets). */
function tenantStoreFor(actor) {
  if (actor.role === ROLES.PLATFORM_ADMIN) {
    return { userId: actor.id, roles: [actor.role], bypassTenant: true, bypassReason: 'platform_admin' };
  }
  const isPatient = actor.role === ROLES.PATIENT;
  return {
    userId: actor.id,
    roles: [actor.role],
    organizationId: actor.organizationId,
    branchId: actor.branchId,
    branchIds: actor.branchIds,
    canReadAllBranches: [ROLES.ADMIN, ROLES.MANAGER, ROLES.PATIENT].includes(actor.role),
    defaultBranchRead: isPatient ? 'all' : 'active',
  };
}

/**
 * @param {object} options
 * @param {boolean} options.required reject anonymous callers (`true`) or let
 *   them through with no `req.user` (`false`)
 * @param {object} [options.deps] injection seam for tests
 */
function createAuthenticator({ required = true, allowPlatform = false, deps = {} } = {}) {
  return asyncHandler(async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
      if (required) {
        throw ApiError.unauthorized('Authentication required', { code: 'TOKEN_MISSING' });
      }
      return next();
    }

    const options = { ...deps, allowPlatform };
    if (required) {
      req.user = await resolveActor(token, options);
      return next();
    }

    // Optional mode treats a bad token as no token. It must never 401, because
    // the whole point is that the endpoint also serves anonymous callers.
    try {
      req.user = await resolveActor(token, options);
    } catch {
      req.user = undefined;
    }
    return next();
  });
}

const authenticate = createAuthenticator({ required: true });
const optionalAuthenticate = createAuthenticator({ required: false });

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;
module.exports.createAuthenticator = createAuthenticator;
module.exports.resolveActor = resolveActor;
module.exports.authenticatePlatform = createAuthenticator({ required: true, allowPlatform: true });
module.exports.tenantStoreFor = tenantStoreFor;
