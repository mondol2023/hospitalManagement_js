'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { ContextMissingError } = require('./tenantErrors');

/**
 * Request context: an AsyncLocalStorage store carrying the active tenant.
 *
 * Always import as a namespace (`const context = require(...)`) because one
 * export is named `require`.
 */

const storage = new AsyncLocalStorage();

let testDefault = null;

function assertTestEnv() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('The test default context is only available when NODE_ENV=test');
  }
}

function run(store, fn) {
  return storage.run(store, fn);
}

/** The current store, or (test only, no store, default set) the test default. */
function get() {
  const store = storage.getStore();
  if (store) return store;
  if (testDefault && process.env.NODE_ENV === 'test') return testDefault;
  return undefined;
}

/** Active branch id; honours the test default, throws when none is bound. */
function activeBranchId() {
  const store = get();
  if (!store || !store.branchId) throw new ContextMissingError();
  return store.branchId;
}

function set(patch) {
  const store = storage.getStore();
  if (!store) throw new ContextMissingError();
  Object.assign(store, patch);
}

function requireStore() {
  const store = storage.getStore();
  if (!store) throw new ContextMissingError();
  return store;
}

function runAs(
  {
    organizationId,
    branchId,
    userId,
    roles,
    source = 'job',
    canReadAllBranches = false,
    defaultBranchRead = 'active',
  },
  fn
) {
  return storage.run(
    { source, userId, roles, organizationId, branchId, canReadAllBranches, defaultBranchRead },
    fn
  );
}

/** Explicit bypass of tenant injection. Runs in a copy so the outer scope is untouched. */
function withoutTenant(reason, fn) {
  const current = storage.getStore();
  return storage.run({ ...current, bypassTenant: true, bypassReason: reason }, fn);
}

function setTestDefault(store) {
  assertTestEnv();
  testDefault = store;
}

function clearTestDefault() {
  assertTestEnv();
  testDefault = null;
}

module.exports = {
  run,
  get,
  activeBranchId,
  set,
  require: requireStore,
  runAs,
  withoutTenant,
  setTestDefault,
  clearTestDefault,
};
