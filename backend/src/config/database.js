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

/**
 * Models are compiled when their module is required, which routinely happens
 * before the connection is open. Mongoose's automatic collection and index
 * creation fires at that moment, and with buffering off it runs against a driver
 * handle that does not exist yet — a `Cannot read properties of undefined
 * (reading 'createCollection')` thrown from a module you never called.
 *
 * Disabling both makes require order irrelevant and matches how indexes should
 * be managed anyway: explicitly, once, after the connection is up — see
 * `ensureIndexes`.
 */
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

let connectionPromise = null;

function buildOptions(overrides = {}) {
  return {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
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

/**
 * Builds the indexes every registered model declares, and waits for them.
 *
 * Two reasons this is a function rather than a connect option. Index creation is
 * a migration concern: building them automatically on every worker start
 * stampedes a production database with N identical builds, so production calls
 * this from a migration step, not from boot. And *waiting* matters in tests — an
 * assertion that a duplicate email is rejected races an index that is still
 * being built, and fails perhaps one run in five.
 *
 * Only models required so far are known to mongoose, so call this after the
 * application graph is loaded.
 *
 * @returns {Promise<void>}
 */
async function ensureIndexes() {
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
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
  ensureIndexes,
  disconnectDatabase,
  isDatabaseHealthy,
  mongoose,
};
