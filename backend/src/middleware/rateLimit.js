'use strict';

const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const env = require('../config/env');
const logger = require('../config/logger');
const { redisClient, isRedisHealthy } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const tokenService = require('../services/tokenService');
const organizationResolver = require('../services/organizationResolver');

// Redis-backed when available (shared across workers), memory otherwise.
// Keyed by verified user where possible so a hospital NAT isn't one bucket.
// A store outage passes requests through rather than taking the API down.

// IPv6 collapses to its /64 so one client can't rotate through addresses.
function normaliseIp(ip) {
  if (!ip) return 'unknown';

  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip.split('%')[0];
  if (!address.includes(':')) return address;

  let groups;
  if (address.includes('::')) {
    const [head, tail = ''] = address.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const gap = Math.max(8 - headParts.length - tailParts.length, 0);
    groups = [...headParts, ...Array(gap).fill('0'), ...tailParts];
  } else {
    groups = address.split(':');
  }

  return `${groups.slice(0, 4).join(':')}::/64`;
}

const BEARER = /^Bearer[ \t]+(\S+)$/i;

const ipKey = (req) => `ip:${normaliseIp(req.ip)}`;

// Signature check only, no DB read: limiters run before `authenticate`.
function subOf(verify, token) {
  if (!token) return null;
  try {
    return verify(token).sub || null;
  } catch {
    return null;
  }
}

function clientKey(req, tokens = tokenService) {
  if (req.user?.id) return `u:${req.user.id}`;
  const match = BEARER.exec(String(req.headers?.authorization || '').trim());
  const sub = subOf((t) => tokens.verifyAccessToken(t), match?.[1]);
  return sub ? `u:${sub}` : ipKey(req);
}

// /auth/refresh has no email, so key by the refresh token's owner.
function refreshKey(req, tokens = tokenService) {
  const sub = subOf((t) => tokens.verifyRefreshToken(t), req.body?.refreshToken);
  return sub ? `u:${sub}` : ipKey(req);
}

// One store per limiter: express-rate-limit rejects a shared one.
function buildStore(prefix) {
  if (!redisClient) return undefined;
  return new RedisStore({
    prefix: `hms:v1:rl:${prefix}:`,
    sendCommand: (...args) => redisClient.call(...args),
  });
}

// Retry-After uses the store's real reset time when it reports one.
function createLimitHandler(windowMs) {
  return function limitReached(req, res, next) {
    const resetTime = req.rateLimit?.resetTime;
    const remainingMs = resetTime ? new Date(resetTime).getTime() - Date.now() : windowMs;
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));

    res.setHeader('Retry-After', String(retryAfter));
    logger.warn('Rate limit exceeded', {
      requestId: req.id,
      key: clientKey(req),
      method: req.method,
      path: req.originalUrl,
    });

    next(ApiError.tooManyRequests(`Too many requests. Please retry in ${retryAfter}s.`));
  };
}

/**
 * @param {object} options
 * @param {string} options.name store prefix; must be unique per limiter
 * @param {number} options.max requests allowed per window
 * @param {number} [options.windowMs]
 * @param {Function} [options.keyGenerator]
 * @param {boolean} [options.skipSuccessfulRequests]
 */
function createLimiter({
  name,
  max,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  keyGenerator = clientKey,
  skipSuccessfulRequests = false,
} = {}) {
  if (!name) throw new Error('createLimiter(): a unique `name` is required');

  return rateLimit({
    windowMs,
    limit: max,
    store: buildStore(name),
    keyGenerator,
    skipSuccessfulRequests,
    passOnStoreError: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: createLimitHandler(windowMs),
  });
}

const globalLimiter = createLimiter({ name: 'global', max: env.RATE_LIMIT_MAX });

// IP + email, plus the organisation only when it exists (junk codes must not mint buckets).
async function authKey(req, resolver = organizationResolver) {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const base = `ip:${normaliseIp(req.ip)}|em:${email.slice(0, 120)}`;
  try {
    const org = await resolver.knownOrganizationCode({
      organizationCode: req.body?.organizationCode,
      host: req.hostname,
    });
    return org ? `${base}|org:${org}` : base;
  } catch (error) {
    logger.warn('Auth throttle org lookup failed', { error: error.message });
    return base;
  }
}

// express-rate-limit calls keyGenerator(req, res); wrap so the 2nd arg never hits our seams.
const authKeyGenerator = (req) => authKey(req);
const refreshKeyGenerator = (req) => refreshKey(req);

// Credential endpoints: failures only, so shift-change logins are free.
const authLimiter = createLimiter({
  name: 'auth',
  max: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: authKeyGenerator,
});

// Refresh failures only, keyed per token owner (see refreshKey).
const refreshLimiter = createLimiter({
  name: 'refresh',
  max: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: refreshKeyGenerator,
});

// Heavy reads: short window to smooth bursts.
const reportLimiter = createLimiter({ name: 'report', max: 30, windowMs: 60 * 1000 });

const uploadLimiter = createLimiter({ name: 'upload', max: 20, windowMs: 60 * 1000 });

module.exports = {
  createLimiter,
  globalLimiter,
  authLimiter,
  refreshLimiter,
  reportLimiter,
  uploadLimiter,
  clientKey,
  authKey,
  authKeyGenerator,
  refreshKeyGenerator,
  refreshKey,
  normaliseIp,
  isRedisHealthy,
};
