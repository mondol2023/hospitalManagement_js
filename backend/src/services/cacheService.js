'use strict';

const { redisClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Read-through cache, never load-bearing: every method swallows its own failure and acts as a miss.
 * Invalidation is by prefix (SCAN), not by guessing the keys a list produced.
 */

const NAMESPACE = 'hms:v1';

/** Deterministic key builder — sorted params, so `?a=1&b=2` and `?b=2&a=1` hit. */
function buildKey(prefix, params = {}) {
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${String(params[k])}`);
  return parts.length ? `${NAMESPACE}:${prefix}:${parts.join('&')}` : `${NAMESPACE}:${prefix}`;
}

class CacheService {
  constructor(client, { defaultTtl = env.CACHE_TTL_SECONDS } = {}) {
    this.client = client || null;
    this.defaultTtl = defaultTtl;
  }

  /** False when Redis is off *or* not currently connected. */
  get isEnabled() {
    return Boolean(this.client) && this.client.status === 'ready';
  }

  async get(key) {
    if (!this.isEnabled) return null;
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (error) {
      logger.warn('Cache read failed', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTtl) {
    if (!this.isEnabled || value === undefined) return false;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
      return true;
    } catch (error) {
      logger.warn('Cache write failed', { key, error: error.message });
      return false;
    }
  }

  async del(...keys) {
    if (!this.isEnabled || !keys.length) return 0;
    try {
      // UNLINK reclaims memory on a background thread; DEL blocks the event loop
      // for large values.
      return await this.client.unlink(...keys);
    } catch (error) {
      logger.warn('Cache delete failed', { error: error.message });
      return 0;
    }
  }

  /** Drops every key under a prefix. */
  async invalidate(prefix) {
    if (!this.isEnabled) return 0;
    const match = `${NAMESPACE}:${prefix}*`;
    let cursor = '0';
    let removed = 0;
    try {
      do {
        const [next, batch] = await this.client.scan(cursor, 'MATCH', match, 'COUNT', 200);
        cursor = next;
        if (batch.length) removed += await this.client.unlink(...batch);
      } while (cursor !== '0');
      return removed;
    } catch (error) {
      logger.warn('Cache invalidation failed', { prefix, error: error.message });
      return removed;
    }
  }

  /** Read-through helper: `producer` runs only on a miss. */
  async wrap(key, producer, ttl = this.defaultTtl) {
    const hit = await this.get(key);
    if (hit !== null) return hit;
    const value = await producer();
    if (value !== null && value !== undefined) await this.set(key, value, ttl);
    return value;
  }

  /** Counter with a TTL on first write — used by the login throttle. */
  async increment(key, ttl) {
    if (!this.isEnabled) return null;
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, ttl);
      return count;
    } catch (error) {
      logger.warn('Cache increment failed', { key, error: error.message });
      return null;
    }
  }

  /** Presence check used by the refresh-token denylist. */
  async has(key) {
    if (!this.isEnabled) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      logger.warn('Cache exists failed', { key, error: error.message });
      return false;
    }
  }

  /** Per-feature key builder and invalidator, so services don't repeat the prefix. */
  namespace(prefix) {
    return {
      key: (sub, params) => buildKey(sub ? `${prefix}:${sub}` : prefix, params),
      invalidate: () => this.invalidate(prefix),
    };
  }

  /** Atomic SET NX: true = claimed, false = already taken, null = cache unavailable. */
  async claim(key, ttl) {
    if (!this.isEnabled) return null;
    if (ttl <= 0) return false;
    try {
      return (await this.client.set(key, '1', 'EX', ttl, 'NX')) === 'OK';
    } catch (error) {
      logger.warn('Cache claim failed', { key, error: error.message });
      return null;
    }
  }

  /** Marks a key present for `ttl` seconds without carrying a payload. */
  async mark(key, ttl) {
    if (!this.isEnabled || ttl <= 0) return false;
    try {
      await this.client.set(key, '1', 'EX', ttl);
      return true;
    } catch (error) {
      logger.warn('Cache mark failed', { key, error: error.message });
      return false;
    }
  }
}

const cacheService = new CacheService(redisClient);

module.exports = cacheService;
module.exports.CacheService = CacheService;
module.exports.buildKey = buildKey;
module.exports.NAMESPACE = NAMESPACE;
