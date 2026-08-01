'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Starts one in-memory MongoDB for the whole integration project.
 *
 * One server, not one per test file: mongod takes a couple of seconds to boot,
 * and paying that per file turns a fast suite into a slow one. Isolation between
 * files comes from clearing collections between tests (see `database.js`), which
 * is far cheaper than a fresh process.
 *
 * The URI travels to the test workers through `process.env`. That works because
 * Jest forks its workers *after* `globalSetup` resolves, so they inherit the
 * variable — which is also why `tests/setup/env.js` defaults `MONGODB_URI`
 * instead of assigning it unconditionally.
 */
module.exports = async function globalSetup() {
  const server = await MongoMemoryServer.create({
    instance: { dbName: 'hospital-test' },
  });

  // `globalTeardown` runs in this same process, so a module-scoped handle would
  // work too — but Jest documents the global, and it survives a config reload.
  globalThis.__MONGO_SERVER__ = server;
  process.env.MONGODB_URI = server.getUri('hospital-test');
};
