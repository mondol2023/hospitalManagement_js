'use strict';

const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const env = require('../config/env');
const logger = require('../config/logger');
const { redisClient, isRedisHealthy } = require('../config/redis');
const ApiError = require('../utils/ApiError');

/**
 * Request throttling.
 *
 * The original app had none, which at 10k users is not a hardening gap so much
 * as a denial-of-service waiting for its first bored client. Three decisions
 * shape this module:
 *
 *  - **Redis-backed when available.** An in-memory counter is per-process, so
 *    under clustering a "10 attempts" limit silently becomes "10 × workers".
 *    With Redis the window is shared by every worker and every instance; without
 *    it we degrade to memory rather than refusing to boot, because local
 *    development and the test suite should not need infrastructure.
 *  - **Keyed by user when authenticated.** Behind a hospital's NAT every
 *    workstation shares one public IP, so IP-only limiting throttles a whole
 *    ward because one person is impatient. IP is the fallback for anonymous
 *    traffic only.
 *  - **A store outage must not become an outage.** `passOnStoreError` lets
 *    requests through if Redis is unreachable. Losing rate limiting for a few
 *    seconds is a lesser failure than refusing every request in the hospital.
 */

/**
 * Collapses an IPv6 address to its /64 prefix.
 *
 * A single residential IPv6 allocation is routinely a /64 or larger, so limiting
 * per full address lets one client rotate through billions of "distinct"
 * identities. IPv4 (including IPv4-mapped form) is used as-is.
 */
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

/** User id when we have one, otherwise the network the caller is on. */
function clientKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${normaliseIp(req.ip)}`;
}

/**
 * Each limiter needs its own store instance — express-rate-limit rejects a
 * shared one (ERR_ERL_STORE_REUSE) because two limiters sharing counters would
 * silently halve each other's budget.
 */
function buildStore(prefix) {
  if (!redisClient) return undefined;
  return new RedisStore({
    prefix: `hms:v1:rl:${prefix}:`,
    sendCommand: (...args) => redisClient.call(...args),
  });
}

/**
 * Turns a rejection into the API's standard error envelope.
 *
 * `resetTime` comes from the store, so the advertised wait is the real one
 * rather than a guess at the window length; the fallback covers stores that do
 * not report it.
 */
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
    // Requests are allowed through if the store is unreachable; the alternative
    // is a Redis blip taking the API down.
    passOnStoreError: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Deterministic tests matter more than throttling a suite that runs alone.
    skip: () => env.isTest,
    handler: createLimitHandler(windowMs),
  });
}

/** Blanket limit for the whole API surface. */
const globalLimiter = createLimiter({ name: 'global', max: env.RATE_LIMIT_MAX });

/**
 * Credential endpoints.
 *
 * Keyed by network *and* submitted email, so neither "one host guessing many
 * accounts" nor "many hosts guessing one account" slips through a limit that
 * only looks at one of them. `skipSuccessfulRequests` means a busy shift-change
 * of legitimate logins never eats into the budget that exists to stop guessing.
 */
const authLimiter = createLimiter({
  name: 'auth',
  max: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `ip:${normaliseIp(req.ip)}|em:${email.slice(0, 120)}`;
  },
});

/**
 * Expensive read endpoints (reports, exports, aggregations).
 *
 * A short window on purpose: these are legitimate but heavy, so the goal is to
 * smooth bursts, not to ration the working day.
 */
const reportLimiter = createLimiter({ name: 'report', max: 30, windowMs: 60 * 1000 });

/** Uploads: few per minute is plenty, and each one costs bandwidth and storage. */
const uploadLimiter = createLimiter({ name: 'upload', max: 20, windowMs: 60 * 1000 });

module.exports = {
  createLimiter,
  globalLimiter,
  authLimiter,
  reportLimiter,
  uploadLimiter,
  clientKey,
  normaliseIp,
  isRedisHealthy,
};
