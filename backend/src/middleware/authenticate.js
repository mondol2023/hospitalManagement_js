'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userRepository = require('../repositories/userRepository');
const tokenService = require('../services/tokenService');

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
async function resolveActor(token, { tokens = tokenService, users = userRepository } = {}) {
  const payload = tokens.verifyAccessToken(token);

  const user = await users.findActiveById(payload.sub);
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

  return {
    id: String(user._id),
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenId: payload.jti,
  };
}

/**
 * @param {object} options
 * @param {boolean} options.required reject anonymous callers (`true`) or let
 *   them through with no `req.user` (`false`)
 * @param {object} [options.deps] injection seam for tests
 */
function createAuthenticator({ required = true, deps = {} } = {}) {
  return asyncHandler(async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
      if (required) {
        throw ApiError.unauthorized('Authentication required', { code: 'TOKEN_MISSING' });
      }
      return next();
    }

    if (required) {
      req.user = await resolveActor(token, deps);
      return next();
    }

    // Optional mode treats a bad token as no token. It must never 401, because
    // the whole point is that the endpoint also serves anonymous callers.
    try {
      req.user = await resolveActor(token, deps);
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
module.exports.extractToken = extractToken;
