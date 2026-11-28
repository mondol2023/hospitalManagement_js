'use strict';

const Organization = require('../models/tenancy/Organization');

/**
 * Organisation status and default registration branch, cached 60 s per process.
 * `Organization` is not tenant-scoped, so no bypass is needed to read it.
 */

const TTL_MS = 60_000;
const cache = new Map();

async function getInfo(organizationId) {
  const key = String(organizationId);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const org = await Organization.findById(key).select('status defaultRegistrationBranch').lean();
  const value = org
    ? { status: org.status, defaultRegistrationBranch: org.defaultRegistrationBranch || null }
    : null;
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

async function getStatus(organizationId) {
  const info = await getInfo(organizationId);
  return info ? info.status : null;
}

function clear(organizationId) {
  if (organizationId === undefined) cache.clear();
  else cache.delete(String(organizationId));
}

module.exports = { getStatus, getInfo, clear };
