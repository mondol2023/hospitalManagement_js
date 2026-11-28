'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const cacheService = require('./cacheService');
const { buildPlatformKey } = cacheService;

/**
 * Access/refresh token issuing, verification and revocation.
 *
 * Three defences, because any one of them alone leaves a hole:
 *
 *  - **Separate secrets.** A refresh token must not be usable as an access token.
 *    The original code signed both with the same key, so any refresh token was a
 *    valid bearer credential for the whole API.
 *  - **`tokensValidFrom`.** Every token carries `iat`; the auth middleware rejects
 *    it when `iat < user.tokensValidFrom`. That is "log out everywhere" and it
 *    works with Redis down, because the check lives in Mongo.
 *  - **A `jti` denylist.** Rotation invalidates the *individual* refresh token
 *    that was just spent, so replaying it fails even though the user's other
 *    sessions stay alive. This one needs Redis; see `revokeRefreshToken`.
 */

const TOKEN_TYPE = Object.freeze({ ACCESS: 'access', REFRESH: 'refresh' });
const DENYLIST_PREFIX = 'jti:revoked';

function denylistKey(jti) {
  return buildPlatformKey(DENYLIST_PREFIX, {}) + `:${jti}`;
}

const clean = (claims) =>
  Object.fromEntries(Object.entries(claims).filter(([, v]) => v !== undefined && v !== null));

/** Active branch claim: explicit, else last active, else default. */
function tenantBranch(user, branchId) {
  const id = branchId ?? user.lastActiveBranch ?? user.defaultBranch;
  return id ? String(id) : undefined;
}

class TokenService {
  constructor({ cache = cacheService, config = env, failClosed = config.isProduction } = {}) {
    this.cache = cache;
    this.config = config;
    this.failClosed = Boolean(failClosed);
  }

  /**
   * @param {object} user hydrated or lean user document
   * @returns {{accessToken:string, refreshToken:string, expiresIn:string, tokenType:string}}
   */
  issueTokens(user, { branchId } = {}) {
    const claims = {
      sub: String(user._id),
      role: user.role,
      org: user.organization ? String(user.organization) : undefined,
      br: tenantBranch(user, branchId),
    };
    return {
      tokenType: 'Bearer',
      expiresIn: this.config.JWT_ACCESS_TTL,
      accessToken: this.signAccessToken(claims),
      refreshToken: this.signRefreshToken(claims),
    };
  }

  signAccessToken({ sub, role, org, br }) {
    const claims = clean({ sub, role, org, br, type: TOKEN_TYPE.ACCESS });
    return jwt.sign(claims, this.config.JWT_ACCESS_SECRET, {
      expiresIn: this.config.JWT_ACCESS_TTL,
      issuer: this.config.JWT_ISSUER,
      jwtid: crypto.randomUUID(),
    });
  }

  signRefreshToken({ sub, role, org, br }) {
    const claims = clean({ sub, role, org, br, type: TOKEN_TYPE.REFRESH });
    return jwt.sign(claims, this.config.JWT_REFRESH_SECRET, {
      expiresIn: this.config.JWT_REFRESH_TTL,
      issuer: this.config.JWT_ISSUER,
      jwtid: crypto.randomUUID(),
    });
  }

  verifyAccessToken(token) {
    return this._verify(token, this.config.JWT_ACCESS_SECRET, TOKEN_TYPE.ACCESS);
  }

  verifyRefreshToken(token) {
    return this._verify(token, this.config.JWT_REFRESH_SECRET, TOKEN_TYPE.REFRESH);
  }

  /**
   * Burns a spent refresh token until its natural expiry.
   *
   * The TTL is the token's own remaining lifetime, so the denylist can never grow
   * without bound — entries evict exactly when the token would have expired anyway.
   */
  async revokeRefreshToken(payload) {
    if (!payload || !payload.jti || !payload.exp) return false;
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    return this.cache.mark(denylistKey(payload.jti), ttl);
  }

  isRefreshRevoked(jti) {
    return this.cache.has(denylistKey(jti));
  }

  /**
   * Single-use spend of a refresh token (atomic, so concurrent replays lose).
   * Throws 401 on replay; 503 if the denylist is down and we fail closed.
   */
  async consumeRefreshToken(payload) {
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    const claimed = await this.cache.claim(denylistKey(payload.jti), ttl);

    if (claimed === false) {
      throw ApiError.unauthorized('This session has been revoked', { code: 'TOKEN_REVOKED' });
    }
    if (claimed === null && this.failClosed) {
      throw ApiError.serviceUnavailable('Session service unavailable, please sign in again', {
        code: 'SESSION_STORE_UNAVAILABLE',
      });
    }
  }

  /**
   * Tokens minted before the user's `tokensValidFrom` watermark are dead.
   *
   * `iat` has second precision, so the comparison floors the watermark to the
   * same resolution — otherwise a token issued in the same second as a password
   * change is rejected purely by sub-second rounding.
   */
  static isStale(payload, tokensValidFrom) {
    if (!tokensValidFrom) return false;
    return payload.iat < Math.floor(new Date(tokensValidFrom).getTime() / 1000);
  }

  /** @private maps jsonwebtoken's error taxonomy onto 401s clients can act on. */
  _verify(token, secret, expectedType) {
    let payload;
    try {
      payload = jwt.verify(token, secret, { issuer: this.config.JWT_ISSUER });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token expired', { code: 'TOKEN_EXPIRED', cause: error });
      }
      throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID', cause: error });
    }

    // Without this check an access token would be accepted at the refresh
    // endpoint (and vice versa) whenever the two secrets happen to match — which
    // is exactly the misconfiguration `env.js` only blocks in production.
    if (payload.type !== expectedType) {
      throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_WRONG_TYPE' });
    }
    return payload;
  }
}

const tokenService = new TokenService();

module.exports = tokenService;
module.exports.TokenService = TokenService;
