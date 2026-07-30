'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const cacheService = require('./cacheService');

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
const DENYLIST_PREFIX = 'hms:v1:jti:revoked';

function denylistKey(jti) {
  return `${DENYLIST_PREFIX}:${jti}`;
}

class TokenService {
  constructor({ cache = cacheService, config = env } = {}) {
    this.cache = cache;
    this.config = config;
  }

  /**
   * @param {object} user hydrated or lean user document
   * @returns {{accessToken:string, refreshToken:string, expiresIn:string, tokenType:string}}
   */
  issueTokens(user) {
    const subject = String(user._id);
    return {
      tokenType: 'Bearer',
      expiresIn: this.config.JWT_ACCESS_TTL,
      accessToken: this.signAccessToken({ sub: subject, role: user.role }),
      refreshToken: this.signRefreshToken({ sub: subject, role: user.role }),
    };
  }

  signAccessToken({ sub, role }) {
    return jwt.sign({ sub, role, type: TOKEN_TYPE.ACCESS }, this.config.JWT_ACCESS_SECRET, {
      expiresIn: this.config.JWT_ACCESS_TTL,
      issuer: this.config.JWT_ISSUER,
      jwtid: crypto.randomUUID(),
    });
  }

  signRefreshToken({ sub, role }) {
    return jwt.sign({ sub, role, type: TOKEN_TYPE.REFRESH }, this.config.JWT_REFRESH_SECRET, {
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
module.exports.TOKEN_TYPE = TOKEN_TYPE;
