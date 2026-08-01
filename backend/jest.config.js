'use strict';

/**
 * Test configuration.
 *
 * The suite is split into two *projects* rather than one flat run, because the
 * two kinds of test have genuinely different needs:
 *
 *  - **unit** — services and pure functions exercised through their constructor
 *    seams with hand-written fakes. No database, no server, no clock. These are
 *    the tests that must stay fast enough to run on every save, so they get no
 *    global setup at all.
 *  - **integration** — the real `createApp()` pipeline mounted under supertest
 *    against an in-memory MongoDB. These need a database, so only this project
 *    pays for starting one.
 *
 * Running them as separate projects means `--selectProjects unit` genuinely
 * skips the mongod boot, instead of starting it and then not using it.
 *
 * `--runInBand` is set in the npm scripts rather than here: the in-memory server
 * is shared through `process.env.MONGODB_URI`, and parallel workers would each
 * clear collections out from under the others.
 */

const setupFiles = ['<rootDir>/tests/setup/env.js'];

module.exports = {
  rootDir: __dirname,

  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: __dirname,
      setupFiles,
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      clearMocks: true,
      restoreMocks: true,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      rootDir: __dirname,
      setupFiles,
      setupFilesAfterEnv: ['<rootDir>/tests/setup/database.js'],
      globalSetup: '<rootDir>/tests/setup/globalSetup.js',
      globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      clearMocks: true,
      restoreMocks: true,
      // The timeout lives in `tests/setup/database.js` as `jest.setTimeout()`:
      // this Jest version rejects `testTimeout` inside a project block.
    },
  ],

  collectCoverageFrom: [
    'src/**/*.js',
    // The process supervisor forks, listens and installs signal handlers; it is
    // covered by running the app, not by importing it.
    '!src/server.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov'],
};
