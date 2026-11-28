'use strict';

const net = require('node:net');
const env = require('../config/env');
const context = require('../utils/context');

const MAX_CANDIDATES = 5;

/** `<subdomain>.<rootDomain>` only; the root itself, IPs and look-alikes give null. */
function subdomainOf(host, rootDomain) {
  if (!host || !rootDomain) return null;
  const name = String(host).toLowerCase().trim().replace(/:\d+$/, '');
  if (net.isIP(name) || name.startsWith('[')) return null;
  const root = String(rootDomain).toLowerCase();
  const suffix = `.${root}`;
  if (!name.endsWith(suffix)) return null;
  const sub = name.slice(0, -suffix.length);
  return sub && !sub.includes('.') ? sub : null;
}

function defaultDeps() {
  // Lazy: models need a live connection only when actually queried.
  const { Organization, User } = require('../models');
  return {
    findOrganizationId: async (filter) => {
      const org = await Organization.findOne(filter).select('_id').lean();
      return org ? org._id : null;
    },
    findUserOrganizations: (email) =>
      context.withoutTenant('auth:login-org-lookup', async () => {
        const users = await User.find({ email }).select('organization').limit(MAX_CANDIDATES).lean();
        return users.map((u) => u.organization).filter(Boolean);
      }),
  };
}

const KNOWN_TTL_MS = 60_000;

function createResolver({ deps, rootDomain } = {}) {
  const get = () => deps || (deps = defaultDeps());

  async function resolve({ organizationCode, host, email } = {}, { allowEmailLookup = true } = {}) {
    if (organizationCode) {
      const id = await get().findOrganizationId({ code: String(organizationCode).trim().toUpperCase() });
      return id ? { organizationId: id } : null;
    }

    const sub = subdomainOf(host, rootDomain || env.ROOT_DOMAIN);
    if (sub) {
      const id = await get().findOrganizationId({ subdomain: sub });
      return id ? { organizationId: id } : null;
    }

    if (allowEmailLookup && email) {
      const ids = await get().findUserOrganizations(String(email).toLowerCase().trim());
      const unique = [...new Set(ids.map(String))];
      if (unique.length === 1) return { organizationId: ids.find((i) => String(i) === unique[0]) };
      if (unique.length > 1) return { candidates: unique.slice(0, MAX_CANDIDATES) };
    }
    return null;
  }

  // Platform-admin helpers live here so every unscoped call sits in one allowlisted file.
  const repo = () => require('../repositories').userRepository;
  const unscoped = (reason, fn) => context.withoutTenant(reason, fn);

  const findPlatformAdmin = (email) =>
    unscoped('auth:platform-login', () => repo().findPlatformAdminWithPassword(email));

  const touchPlatformAdminLogin = (userId) =>
    unscoped('auth:platform-login', () => repo().touchLogin(userId));

  const loadUserForRefresh = (userId) =>
    unscoped('auth:platform-refresh', () => repo().findActiveById(userId));

  // Only real organisations may widen a throttle key; cached so junk costs one lookup per minute.
  const known = new Map();
  async function lookupKnown(kind, raw) {
    const key = `${kind}:${raw}`;
    const hit = known.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const id = await get().findOrganizationId(kind === 'c' ? { code: raw } : { subdomain: raw });
    const value = id ? raw : '';
    if (known.size > 1000) known.clear();
    known.set(key, { value, expires: Date.now() + KNOWN_TTL_MS });
    return value;
  }

  async function knownOrganizationCode({ organizationCode, host } = {}) {
    const code = organizationCode ? String(organizationCode).trim().toUpperCase().slice(0, 8) : '';
    if (code) {
      const hit = await lookupKnown('c', code);
      if (hit) return hit;
    }
    const sub = subdomainOf(host, rootDomain || env.ROOT_DOMAIN);
    return sub ? lookupKnown('s', sub) : '';
  }

  return { resolve, findPlatformAdmin, touchPlatformAdminLogin, loadUserForRefresh, knownOrganizationCode };
}

module.exports = createResolver();
module.exports.createResolver = createResolver;
module.exports.subdomainOf = subdomainOf;
