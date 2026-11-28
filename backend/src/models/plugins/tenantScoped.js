'use strict';

/**
 * Fail-closed tenant isolation for Mongoose models.
 *
 * Spike result (Mongoose 8.24.3, run in Task 2): `schema.pre('bulkWrite', fn)`
 * DOES fire on `Model.bulkWrite`, with `fn(next, ops, options)`, and operations
 * mutated in the hook reach the driver (casting happens after the hook). So
 * bulkWrite is handled by middleware below, not by a static wrapper. The same
 * spike showed `pre('validate')` also runs for every document of `insertMany`
 * and that a synchronous throw in `pre('estimatedDocumentCount')` rejects the
 * call.
 *
 * Every read, write and aggregate on a scoped model is narrowed to the active
 * organisation (and branch, for branch scope) taken from the request context. A
 * missing tenant throws instead of reading globally; `context.withoutTenant`
 * is the only way to opt out.
 */

const mongoose = require('mongoose');
const context = require('../../utils/context');
const { TenantContextMissingError, TenantViolationError } = require('../../utils/tenantErrors');

const { ObjectId } = mongoose.Types;

const QUERY_HOOKS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];
const UPDATE_OPS = new Set(['findOneAndUpdate', 'updateOne', 'updateMany']);
const REPLACE_OPS = new Set(['findOneAndReplace', 'replaceOne']);
// Stages that must stay first in a pipeline; the tenant $match goes second.
const LEADING_STAGES = new Set(['$geoNear', '$search', '$vectorSearch']);
// Stages that write to another collection, outside any $match.
const WRITING_STAGES = ['$out', '$merge'];
// Only these sources may name a branch explicitly; a request may not.
const BRANCH_OVERRIDE_SOURCES = new Set(['job', 'script']);

const toId = (value) => (value instanceof ObjectId ? value : new ObjectId(String(value)));
const sameId = (a, b) => String(a) === String(b);

/** The store to scope by, `null` when explicitly bypassed. Throws when there is none. */
function activeStore() {
  const store = context.get();
  if (store && store.bypassTenant) return null;
  if (!store || !store.organizationId) throw new TenantContextMissingError();
  return store;
}

/**
 * The `{ organization[, branch] }` filter for the current store.
 * `options` carries the per-call `branch` override and `branches: 'all'` request.
 */
function tenantFilter(store, options, branchScoped) {
  const filter = { organization: toId(store.organizationId) };
  if (!branchScoped) return filter;

  if (options.branch != null && BRANCH_OVERRIDE_SOURCES.has(store.source)) {
    filter.branch = toId(options.branch);
    return filter;
  }
  const widened =
    (options.branches === 'all' && store.canReadAllBranches === true) ||
    store.defaultBranchRead === 'all';
  if (widened) return filter;

  if (!store.branchId) {
    throw new TenantContextMissingError('Branch context is missing for a branch-scoped operation');
  }
  filter.branch = toId(store.branchId);
  return filter;
}

/** Strips the plugin's own options so the driver never sees them. */
function takeOptions(options) {
  const taken = { branch: options.branch, branches: options.branches };
  delete options.branch;
  delete options.branches;
  return taken;
}

function touchesTenantFields(update, keys) {
  const isTenantKey = (key) => typeof key === 'string' && keys.includes(key.split('.')[0]);
  if (!update) return false;
  if (Array.isArray(update)) return update.some((stage) => touchesTenantFields(stage, keys));
  if (typeof update !== 'object') return false;
  return Object.entries(update).some(([key, value]) => {
    if (!key.startsWith('$')) return isTenantKey(key);
    if (typeof value === 'string') return isTenantKey(value);
    if (Array.isArray(value)) return value.some(isTenantKey);
    if (value && typeof value === 'object') return Object.keys(value).some(isTenantKey);
    return false;
  });
}

function assertUpdateKeepsTenant(update, keys) {
  if (touchesTenantFields(update, keys)) {
    throw new TenantViolationError('An update may not set or remove organization or branch');
  }
}

/** A replacement document carrying the active tenant; a conflicting one is rejected. */
function stampedReplacement(replacement, filter, branchScoped) {
  const next =
    replacement && typeof replacement.toObject === 'function'
      ? replacement.toObject()
      : { ...replacement };
  if (next.organization != null && !sameId(next.organization, filter.organization)) {
    throw new TenantViolationError('Replacement document belongs to another organization');
  }
  next.organization = filter.organization;
  if (branchScoped) {
    if (next.branch != null && filter.branch && !sameId(next.branch, filter.branch)) {
      throw new TenantViolationError('Replacement document belongs to another branch');
    }
    if (next.branch == null) {
      if (!filter.branch) {
        throw new TenantViolationError('A replacement must name its branch when reading all branches');
      }
      next.branch = filter.branch;
    }
  }
  return next;
}

function tenantScoped(schema, { scope, optionalWhen } = {}) {
  if (scope !== 'organization' && scope !== 'branch') {
    throw new Error("tenantScoped requires scope: 'organization' | 'branch'");
  }
  const branchScoped = scope === 'branch';
  const tenantKeys = branchScoped ? ['organization', 'branch'] : ['organization'];
  const isOptional = (doc) => typeof optionalWhen === 'function' && optionalWhen(doc) === true;

  // Platform-level documents (see `optionalWhen`) carry no tenant at all.
  const required = function requiredUnlessPlatformLevel() {
    return !isOptional(this);
  };
  schema.add({ organization: { type: ObjectId, ref: 'Organization', required } });
  if (branchScoped) schema.add({ branch: { type: ObjectId, ref: 'Branch', required } });

  schema.statics.tenantFields = function tenantFields() {
    return [...tenantKeys];
  };

  /** For jobs that loop over branches: reads one branch (honoured for job/script sources only). */
  schema.statics.forBranch = function forBranch(branchId) {
    const Model = this;
    const on = (query) => query.setOptions({ branch: branchId });
    return {
      find: (...args) => on(Model.find(...args)),
      findOne: (...args) => on(Model.findOne(...args)),
      countDocuments: (...args) => on(Model.countDocuments(...args)),
    };
  };

  // --- documents -----------------------------------------------------------

  function stamp(target, store) {
    const { organizationId, branchId } = store;
    if (target.organization == null) {
      if (isOptional(target)) return;
      target.organization = organizationId;
    } else if (!sameId(target.organization, organizationId)) {
      throw new TenantViolationError('Document belongs to another organization than the active tenant');
    }
    if (branchScoped && target.branch == null) {
      if (!branchId) {
        throw new TenantContextMissingError('Branch context is missing for a branch-scoped document');
      }
      target.branch = branchId;
    }
  }

  schema.pre('validate', function stampOnValidate() {
    const current = context.get();
    if (current && current.bypassTenant) return;
    if (!this.isNew) {
      // A loaded document was already filtered to its tenant; only guard a mismatch.
      const store = current && current.organizationId ? current : null;
      if (store && this.organization != null && !sameId(this.organization, store.organizationId)) {
        throw new TenantViolationError('Document belongs to another organization than the active tenant');
      }
      return;
    }
    if (this.organization == null && isOptional(this)) return;
    stamp(this, activeStore());
  });

  // --- queries -------------------------------------------------------------

  schema.pre(QUERY_HOOKS, function scopeQuery() {
    const options = takeOptions(this.getOptions());
    const store = activeStore();
    if (!store) return;
    const filter = tenantFilter(store, options, branchScoped);

    if (UPDATE_OPS.has(this.op)) assertUpdateKeepsTenant(this.getUpdate(), tenantKeys);
    if (REPLACE_OPS.has(this.op)) {
      this.setUpdate(stampedReplacement(this.getUpdate(), filter, branchScoped));
    }
    // $and so a caller's own organization/branch condition can only narrow, never widen.
    this.and([filter]);
  });

  schema.pre('estimatedDocumentCount', function refuseEstimatedCount() {
    const store = context.get();
    if (store && store.bypassTenant) return;
    throw new TenantViolationError(
      'estimatedDocumentCount cannot be filtered by tenant; use countDocuments'
    );
  });

  // --- aggregate -----------------------------------------------------------

  schema.pre('aggregate', function scopeAggregate() {
    const options = takeOptions(this.options || {});
    const store = activeStore();
    if (!store) return;
    const pipeline = this.pipeline();
    if (pipeline.some((stage) => WRITING_STAGES.some((name) => name in stage))) {
      throw new TenantViolationError('$out and $merge are not allowed on tenant-scoped models');
    }
    const match = { $match: tenantFilter(store, options, branchScoped) };
    const leading = pipeline[0] && LEADING_STAGES.has(Object.keys(pipeline[0])[0]);
    pipeline.splice(leading ? 1 : 0, 0, match);
  });

  // --- bulk writes ---------------------------------------------------------

  schema.pre('insertMany', function scopeInsertMany(next, docs) {
    try {
      const current = context.get();
      if (current && current.bypassTenant) return next();
      if (!current || !current.organizationId) {
        // A platform-level model may still insert; its own validate hook decides.
        if (typeof optionalWhen !== 'function') throw new TenantContextMissingError();
        return next();
      }
      // `validate` stamps each document, but `ordered: false` swallows its errors;
      // a foreign organization must still fail loudly.
      for (const doc of Array.isArray(docs) ? docs : [docs]) {
        if (doc && doc.organization != null && !sameId(doc.organization, current.organizationId)) {
          throw new TenantViolationError('Document belongs to another organization than the active tenant');
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });

  schema.pre('bulkWrite', function scopeBulkWrite(next, ops) {
    try {
      const store = activeStore();
      if (!store) return next();
      const filter = tenantFilter(store, {}, branchScoped);
      const scoped = (original) => ({ $and: [original || {}, filter] });

      for (const op of ops || []) {
        const [kind] = Object.keys(op);
        const spec = op[kind];
        switch (kind) {
          case 'insertOne':
            stamp(spec.document, store);
            break;
          case 'updateOne':
          case 'updateMany':
            assertUpdateKeepsTenant(spec.update, tenantKeys);
            spec.filter = scoped(spec.filter);
            break;
          case 'replaceOne':
            spec.replacement = stampedReplacement(spec.replacement, filter, branchScoped);
            spec.filter = scoped(spec.filter);
            break;
          case 'deleteOne':
          case 'deleteMany':
            spec.filter = scoped(spec.filter);
            break;
          default:
            throw new TenantViolationError(`bulkWrite operation "${kind}" is not allowed on tenant-scoped models`);
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = tenantScoped;
