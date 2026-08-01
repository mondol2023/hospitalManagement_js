'use strict';

/**
 * Stops the in-memory MongoDB.
 *
 * Without this the mongod child process outlives the test run and Jest reports
 * "a worker process has failed to exit gracefully" — or, on Windows, leaves a
 * lock on the data directory that makes the *next* run fail.
 */
module.exports = async function globalTeardown() {
  const server = globalThis.__MONGO_SERVER__;
  if (server) await server.stop();
};
