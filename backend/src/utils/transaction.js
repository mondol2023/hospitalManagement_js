'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../config/logger');

// Runs `fn` in a transaction when the deployment supports one, else with a null
// session (standalone dev/test mongod). Call sites pass the session through, so
// moving to a replica set makes those writes atomic with no code change.

let supported = null;

async function detectTransactionSupport(connection = mongoose.connection) {
  try {
    // `hello` reports `setName` on a replica set member and `isdbgrid` on mongos.
    const info = await connection.db.admin().command({ hello: 1 });
    return Boolean(info.setName || info.msg === 'isdbgrid');
  } catch (error) {
    logger.warn('Could not determine transaction support; assuming standalone', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Probes once at boot. In production a standalone deployment is fatal, because
 * multi-document writes (payments, dispensing) would silently lose atomicity.
 */
async function assertTransactionSupport({
  connection = mongoose.connection,
  required = env.requireTransactions,
} = {}) {
  supported = await detectTransactionSupport(connection);
  if (supported) return true;

  if (required) {
    throw new Error(
      'MongoDB does not support transactions (needs a replica set or mongos). ' +
        'Fix the deployment, or set MONGO_REQUIRE_TRANSACTIONS=false to accept non-atomic writes.'
    );
  }
  logger.warn('MongoDB has no transaction support; multi-document writes are not atomic');
  return false;
}

/**
 * @param {(session: import('mongoose').ClientSession|null) => Promise<any>} fn
 * @returns {Promise<any>} whatever `fn` resolves to
 */
async function withTransaction(fn) {
  if (supported === null) supported = await detectTransactionSupport();
  if (!supported) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    // The driver may retry the callback on transient errors, so keep it free of
    // side effects outside the session.
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Test seam: forces the next call to re-probe. */
function resetTransactionSupport() {
  supported = null;
}

module.exports = {
  withTransaction,
  detectTransactionSupport,
  assertTransactionSupport,
  resetTransactionSupport,
};
