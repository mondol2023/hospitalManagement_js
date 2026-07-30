'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

/**
 * MongoDB connection management.
 *
 * Pool sizing is the single most important knob for the 10k-user target: each
 * pooled socket serves many concurrent logical requests because driver ops are
 * pipelined, so ~50 connections per process comfortably covers thousands of
 * concurrent users. `useNewUrlParser`/`useUnifiedTopology` from the original
 * code are no-ops removed in driver v4+ and were emitting deprecation warnings.
 */

mongoose.set('strictQuery', true);

// Fail fast instead of buffering operations for 10s when the DB is unreachable.
mongoose.set('bufferCommands', false);

let connectionPromise = null;

function buildOptions(overrides = {}) {
  return {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
    // Index creation is a migration concern, not a boot-time concern. Building
    // indexes automatically on every worker start stampedes a production DB.
    autoIndex: !env.isProduction,
    ...overrides,
  };
}

function registerListeners() {
  const conn = mongoose.connection;
  conn.on('connected', () => logger.info('MongoDB connected'));
  conn.on('disconnected', () => logger.warn('MongoDB disconnected'));
  conn.on('reconnected', () => logger.info('MongoDB reconnected'));
  conn.on('error', (err) => logger.error('MongoDB error', { error: err.message }));
}

let listenersRegistered = false;

/**
 * Idempotent connect: concurrent callers share one in-flight promise so cluster
 * workers and tests never open duplicate pools.
 */
async function connectDatabase(uri = env.MONGODB_URI, options = {}) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  if (!listenersRegistered) {
    registerListeners();
    listenersRegistered = true;
  }

  connectionPromise = mongoose
    .connect(uri, buildOptions(options))
    .then(() => mongoose.connection)
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}

async function disconnectDatabase() {
  connectionPromise = null;
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

/** Used by the readiness probe — 1 === connected. */
function isDatabaseHealthy() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  isDatabaseHealthy,
  mongoose,
};
