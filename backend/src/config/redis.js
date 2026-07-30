'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

/**
 * Redis client factory.
 *
 * The original module built a client at require-time from an env var that had
 * not been loaded yet, and had no failure story. Here connections are created
 * lazily, retry with capped backoff, and are entirely optional: with Redis off
 * the app still serves traffic (single-instance, uncached). That keeps local
 * development and the test suite free of infrastructure requirements while
 * production gets a shared cache, a shared rate-limit store, and a socket.io
 * pub/sub backplane.
 */

const CLIENT_OPTIONS = {
  // Commands issued while down fail fast rather than queueing without bound.
  enableOfflineQueue: false,
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  retryStrategy: (times) => Math.min(times * 200, 5000),
  reconnectOnError: (err) => err.message.includes('READONLY'), // failover to new primary
};

const clients = new Set();

function createRedisClient(name = 'default', overrides = {}) {
  if (!env.redisEnabled) return null;

  const client = new Redis(env.REDIS_URL, { ...CLIENT_OPTIONS, ...overrides });

  client.on('connect', () => logger.info(`Redis connected (${name})`));
  client.on('ready', () => logger.debug(`Redis ready (${name})`));
  client.on('close', () => logger.warn(`Redis connection closed (${name})`));
  // Without an 'error' listener ioredis emits an unhandled 'error' event, which
  // crashes the process. Log and let the retry strategy do its job.
  client.on('error', (err) => logger.error(`Redis error (${name})`, { error: err.message }));

  clients.add(client);
  return client;
}

/** Primary client used for caching, token denylists and rate limiting. */
const redisClient = createRedisClient('primary');

function isRedisHealthy() {
  return redisClient ? redisClient.status === 'ready' : false;
}

async function disconnectRedis() {
  await Promise.all(
    [...clients].map(async (client) => {
      try {
        await client.quit();
      } catch {
        client.disconnect(); // already closing/closed — force it
      }
    })
  );
  clients.clear();
}

module.exports = {
  redisClient,
  createRedisClient,
  isRedisHealthy,
  disconnectRedis,
};
