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

// Booting mongod and building indexes costs more than the 5s default allows.
jest.setTimeout(30_000);

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
  await connectDatabase(process.env.MONGODB_URI);
  await ensureIndexes();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});
