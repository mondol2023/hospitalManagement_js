'use strict';

const {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
  mongoose,
} = require('../../src/config/database');

// Requiring the models registers all sixteen with mongoose, so `ensureIndexes`
// below covers the whole schema rather than whatever the test happened to touch.
require('../../src/models');
const { ensureDefaultTenant } = require('../helpers/tenant');

// Booting mongod and building indexes costs more than the 5s default allows.
jest.setTimeout(30_000);

/**
 * Each worker gets its own database inside the one shared mongod.
 *
 * Isolation between test *files* comes from clearing collections after every
 * test — which is only safe if no other file is using the same collections at
 * the same time. Under `--runInBand` that holds trivially. Run without it and
 * Jest forks a worker per core, four files clear each other's users mid-request,
 * and the failures surface as `401 ACCOUNT_INACTIVE` from a token whose account
 * another file just deleted: nothing about the message points at the real cause.
 *
 * Naming the database after the worker makes the suite correct under either
 * invocation, so `npx jest` behaves the same as `npm test`. Databases are cheap
 * — one mongod process still serves them all, and `globalTeardown` disposes of
 * the lot.
 */
function workerDatabaseUri() {
  const uri = new URL(process.env.MONGODB_URI);
  uri.pathname = `/hospital-test-${process.env.JEST_WORKER_ID || '1'}`;
  return uri.toString();
}

/**
 * Per-file database lifecycle for the integration project.
 *
 * **Connect once per file.** `connectDatabase` is idempotent and shares one
 * in-flight promise, so this is cheap even under `--runInBand` where several
 * files hit it in the same process.
 *
 * **Build indexes explicitly.** Automatic index creation is off (see
 * `config/database.js`), and even with it on `mongoose.connect()` would not wait
 * for the builds — so a test asserting that a duplicate email is rejected would
 * race the unique index into existence and fail perhaps one run in five.
 * `ensureIndexes()` resolves only once every index exists.
 *
 * **Clear, do not drop.** `deleteMany({})` between tests empties the data while
 * leaving the indexes standing. Dropping collections would delete the indexes
 * too and quietly disable every uniqueness assertion after the first test.
 */

beforeAll(async () => {
  // Passed explicitly rather than relying on the frozen config: `globalSetup`
  // writes the in-memory URI into the environment, and being obvious about
  // where the connection points is worth one argument.
  await connectDatabase(workerDatabaseUri());
  await ensureIndexes();
});

// `afterEach` clears the tenancy collections too, so the default tenant is rebuilt each time.
beforeEach(async () => {
  require('../../src/services/organizationStatus').clear();
  await ensureDefaultTenant();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});
