'use strict';

const jwt = require('jsonwebtoken');

const { TokenService } = require('../../src/services/tokenService');
const env = require('../../src/config/env');
const ApiError = require('../../src/utils/ApiError');
const { ROLES } = require('../../src/utils/constants');

/**
 * Token issuing and verification, tested at the seam rather than over HTTP.
 *
 * The auth integration suite proves a login returns a token that works. It
 * cannot prove the things that actually matter here, because all of them are
 * *refusals* of credentials no honest client would ever send: a refresh token
 * presented as a bearer credential, a token signed by someone else's issuer, a
 * spent token replayed after rotation. Those need tokens forged by hand, which
 * means constructing the service directly with a fake cache and a doctored
 * config.
 *
 * `TokenService` takes both through its constructor precisely so this file can
 * exist — no Redis, no database, no clock mocking.
 */

const fakeCache = () => ({
  mark: jest.fn().mockResolvedValue(true),
  has: jest.fn().mockResolvedValue(false),
});

const user = (overrides = {}) => ({ _id: 'user-1', role: ROLES.DOCTOR, ...overrides });

const decode = (token) => jwt.decode(token);

describe('tokenService — issuing', () => {
  const service = new TokenService({ cache: fakeCache() });

  it('issues a usable pair with the advertised type and lifetime', () => {
    const tokens = service.issueTokens(user());

    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(env.JWT_ACCESS_TTL);
    expect(service.verifyAccessToken(tokens.accessToken)).toMatchObject({
      sub: 'user-1',
      role: ROLES.DOCTOR,
      type: 'access',
    });
    expect(service.verifyRefreshToken(tokens.refreshToken)).toMatchObject({ type: 'refresh' });
  });

  it('stringifies the subject so an ObjectId round-trips as its hex', () => {
    // `sub` must be a string per RFC 7519, and jsonwebtoken throws on an object.
    const oid = { toString: () => '507f1f77bcf86cd799439011' };
    const { accessToken } = service.issueTokens(user({ _id: oid }));
    expect(decode(accessToken).sub).toBe('507f1f77bcf86cd799439011');
  });

  it('gives every token its own jti', () => {
    // Rotation burns one token by id. Reused ids would mean revoking one session
    // logs out another — or worse, that a replayed token looks unrevoked.
    const ids = new Set();
    for (let i = 0; i < 5; i += 1) {
      const { accessToken, refreshToken } = service.issueTokens(user());
      ids.add(decode(accessToken).jti);
      ids.add(decode(refreshToken).jti);
    }
    expect(ids.size).toBe(10);
  });

  it('carries an iat, which is what the logout-everywhere watermark compares to', () => {
    const { accessToken } = service.issueTokens(user());
    expect(decode(accessToken).iat).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
  });
});

describe('tokenService — verification refuses', () => {
  const service = new TokenService({ cache: fakeCache() });

  const expectUnauthorized = (fn, code) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
      expect(error.code).toBe(code);
      return;
    }
    throw new Error('expected verification to throw');
  };

  it('a refresh token presented as an access token', () => {
    // The original code signed both with one secret, which made every refresh
    // token a valid bearer credential for the whole API.
    const { refreshToken } = service.issueTokens(user());
    expectUnauthorized(() => service.verifyAccessToken(refreshToken), 'TOKEN_INVALID');
  });

  it('an access token presented at the refresh endpoint', () => {
    const { accessToken } = service.issueTokens(user());
    expectUnauthorized(() => service.verifyRefreshToken(accessToken), 'TOKEN_INVALID');
  });

  it('the wrong token type even when the two secrets are identical', () => {
    // Separate secrets are the first defence; `env.js` only *enforces* that they
    // differ in production. The `type` claim is what holds the line when someone
    // pastes the same value twice into a staging environment.
    const misconfigured = new TokenService({
      cache: fakeCache(),
      config: { ...env, JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET },
    });
    const { refreshToken } = misconfigured.issueTokens(user());
    expectUnauthorized(() => misconfigured.verifyAccessToken(refreshToken), 'TOKEN_WRONG_TYPE');
  });

  it('an expired token, distinguishably from an invalid one', () => {
    // The client needs the two apart: expired means "refresh and retry",
    // invalid means "log in again".
    const shortLived = new TokenService({
      cache: fakeCache(),
      config: { ...env, JWT_ACCESS_TTL: '-10s' },
    });
    const { accessToken } = shortLived.issueTokens(user());
    expectUnauthorized(() => service.verifyAccessToken(accessToken), 'TOKEN_EXPIRED');
  });

  it('a token signed with a foreign key', () => {
    const forged = jwt.sign({ sub: 'user-1', role: ROLES.ADMIN, type: 'access' }, 'attacker-key', {
      issuer: env.JWT_ISSUER,
    });
    expectUnauthorized(() => service.verifyAccessToken(forged), 'TOKEN_INVALID');
  });

  it('a token from another issuer sharing our secret', () => {
    // A secret reused across two of the hospital's services would otherwise let
    // one service's tokens authenticate against this one.
    const foreign = jwt.sign(
      { sub: 'user-1', role: ROLES.ADMIN, type: 'access' },
      env.JWT_ACCESS_SECRET,
      { issuer: 'some-other-service' }
    );
    expectUnauthorized(() => service.verifyAccessToken(foreign), 'TOKEN_INVALID');
  });

  it('an unsigned token claiming the "none" algorithm', () => {
    const [header, payload] = jwt
      .sign({ sub: 'user-1', role: ROLES.ADMIN, type: 'access' }, env.JWT_ACCESS_SECRET, {
        issuer: env.JWT_ISSUER,
      })
      .split('.');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    );
    expectUnauthorized(() => service.verifyAccessToken(`${noneHeader}.${payload}.`), 'TOKEN_INVALID');
    expectUnauthorized(() => service.verifyAccessToken(`${header}.${payload}.`), 'TOKEN_INVALID');
  });

  it('a body edited to promote its holder', () => {
    const { accessToken } = service.issueTokens(user());
    const [header, , signature] = accessToken.split('.');
    const escalated = Buffer.from(
      JSON.stringify({ ...decode(accessToken), role: ROLES.ADMIN })
    ).toString('base64url');
    expectUnauthorized(
      () => service.verifyAccessToken(`${header}.${escalated}.${signature}`),
      'TOKEN_INVALID'
    );
  });

  it('anything that is not a token at all', () => {
    for (const junk of ['', 'null', 'undefined', 'a.b.c', undefined, null]) {
      expectUnauthorized(() => service.verifyAccessToken(junk), 'TOKEN_INVALID');
    }
  });
});

describe('tokenService — revocation', () => {
  it('burns a spent token for exactly its remaining lifetime', () => {
    // The TTL is what keeps the denylist bounded: entries evict when the token
    // would have expired anyway, so it can never grow without limit.
    const cache = fakeCache();
    const service = new TokenService({ cache });
    const now = Math.floor(Date.now() / 1000);

    service.revokeRefreshToken({ jti: 'jti-1', exp: now + 600 });

    const [, ttl] = cache.mark.mock.calls[0];
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('looks the token up under the same key it burned it with', () => {
    // Two independently built key strings is the classic way a denylist silently
    // stops denying anything.
    const cache = fakeCache();
    const service = new TokenService({ cache });

    service.revokeRefreshToken({ jti: 'jti-1', exp: Math.floor(Date.now() / 1000) + 60 });
    service.isRefreshRevoked('jti-1');

    expect(cache.has.mock.calls[0][0]).toBe(cache.mark.mock.calls[0][0]);
    expect(cache.mark.mock.calls[0][0]).toContain('jti-1');
  });

  it('namespaces the key so revocation cannot collide with cached data', () => {
    const cache = fakeCache();
    new TokenService({ cache }).isRefreshRevoked('jti-1');
    expect(cache.has.mock.calls[0][0]).toMatch(/^hms:v1:/);
  });

  it('does not touch the cache for a payload it cannot key on', async () => {
    // A malformed payload must fail closed and silently, not write a key like
    // `...:undefined` that every other malformed token would then match.
    const cache = fakeCache();
    const service = new TokenService({ cache });
    const now = Math.floor(Date.now() / 1000);

    for (const payload of [null, undefined, {}, { jti: 'x' }, { exp: now + 60 }]) {
      await expect(service.revokeRefreshToken(payload)).resolves.toBe(false);
    }
    expect(cache.mark).not.toHaveBeenCalled();
  });

  it('survives Redis being unavailable', () => {
    // `mark` returns false with the cache down. Revocation is best-effort by
    // design — `tokensValidFrom` in Mongo is the defence that still works.
    const cache = { mark: jest.fn().mockResolvedValue(false), has: jest.fn().mockResolvedValue(false) };
    const service = new TokenService({ cache });

    return Promise.all([
      expect(
        service.revokeRefreshToken({ jti: 'jti-1', exp: Math.floor(Date.now() / 1000) + 60 })
      ).resolves.toBe(false),
      expect(service.isRefreshRevoked('jti-1')).resolves.toBe(false),
    ]);
  });
});

describe('tokenService — the logout-everywhere watermark', () => {
  const at = (date) => Math.floor(new Date(date).getTime() / 1000);

  it('lets everything through for a user who has never invalidated', () => {
    for (const empty of [null, undefined, 0, '']) {
      expect(TokenService.isStale({ iat: at('2020-01-01T00:00:00Z') }, empty)).toBe(false);
    }
  });

  it('kills tokens minted before the watermark', () => {
    expect(
      TokenService.isStale({ iat: at('2026-01-01T00:00:00Z') }, new Date('2026-01-02T00:00:00Z'))
    ).toBe(true);
  });

  it('spares tokens minted after it', () => {
    expect(
      TokenService.isStale({ iat: at('2026-01-03T00:00:00Z') }, new Date('2026-01-02T00:00:00Z'))
    ).toBe(false);
  });

  it('does not kill a token issued in the same second as the password change', () => {
    // `iat` has second precision and `tokensValidFrom` has millisecond
    // precision. Comparing them unfloored logs a user out of the session they
    // just created by changing their password — a bug that only reproduces when
    // the two events land in the same second.
    const watermark = new Date('2026-01-02T00:00:00.750Z');
    expect(TokenService.isStale({ iat: at('2026-01-02T00:00:00.000Z') }, watermark)).toBe(false);
  });

  it('accepts the watermark in either shape Mongo hands back', () => {
    const iat = at('2026-01-01T00:00:00Z');
    expect(TokenService.isStale({ iat }, '2026-01-02T00:00:00Z')).toBe(true);
    expect(TokenService.isStale({ iat }, new Date('2026-01-02T00:00:00Z'))).toBe(true);
  });
});
