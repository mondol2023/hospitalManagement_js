'use strict';

const mongoose = require('mongoose');
const logger = require('../config/logger');

/**
 * Runs a unit of work in a transaction *when the deployment supports one*.
 *
 * MongoDB only offers multi-document transactions on a replica set or a sharded
 * cluster. Calling `startTransaction()` against a standalone `mongod` — which is
 * what a developer laptop and a default `mongodb-memory-server` both are — throws
 * `IllegalOperation`. Hard-coding sessions would make the app unrunnable outside
 * production; ignoring them would make production lose atomicity silently.
 *
 * So support is probed once against the live connection and cached. When
 * transactions are available the callback gets a session and everything commits
 * or rolls back together; when they are not, the callback gets `null` and the
 * repositories simply run unsessioned. Every call site passes the session
 * through, so promoting a deployment to a replica set makes those writes atomic
 * with no code change.
 */

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
 * @param {(session: import('mongoose').ClientSession|null) => Promise<any>} fn
 * @returns {Promise<any>} whatever `fn` resolves to
 */
async function withTransaction(fn) {
  if (supported === null) {
    supported = await detectTransactionSupport();
    if (!supported) {
      logger.warn(
        'MongoDB deployment does not support transactions — multi-document writes ' +
          'will run without atomicity. Use a replica set in production.'
      );
    }
  }

  if (!supported) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    // `withTransaction` retries the whole callback on transient commit errors,
    // which is why the callback must stay side-effect-free outside the session.
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Test seam — forces the next call to re-probe. */
function resetTransactionSupport() {
  supported = null;
}

module.exports = { withTransaction, detectTransactionSupport, resetTransactionSupport };
