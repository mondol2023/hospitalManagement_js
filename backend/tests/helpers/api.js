'use strict';

const supertest = require('supertest');
const createApp = require('../../src/app');

/**
 * One app instance for the whole integration project.
 *
 * `createApp()` is pure — it opens no socket and holds no connection — so a
 * single instance is safe to share and avoids re-running helmet/cors setup for
 * every test file. Supertest binds an ephemeral port per request and releases it,
 * so no listener is ever left behind.
 */
const app = createApp();

/** `request(app).get('/api/v1/...')`, with the version prefix already applied. */
const api = () => supertest(app);

/** Path builder, so a version bump is one edit rather than several hundred. */
const url = (path) => `/api/v1${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Asserts the shape every failure in this API must have.
 *
 * Tests that only check the status code let a 403 with an empty body pass, and
 * the client contract is the envelope, not the number.
 */
function expectError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error).toBeDefined();
  if (code) expect(response.body.error.code).toBe(code);
  return response.body.error;
}

function expectOk(response, status = 200) {
  if (response.status !== status) {
    // Surfacing the body turns "expected 200, got 400" into an actionable
    // failure without a second debugging run.
    throw new Error(
      `Expected ${status} but got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
  expect(response.body.success).toBe(true);
  return response.body.data;
}

module.exports = { app, api, url, expectError, expectOk };
