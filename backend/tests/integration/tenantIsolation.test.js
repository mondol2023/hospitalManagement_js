'use strict';

const { app, api, url } = require('../helpers/api');
const { listRoutes } = require('../helpers/routeWalker');
const { makeTenant } = require('../helpers/tenant');
const { createActor } = require('../helpers/factories');
const { FIXTURES, EXEMPT, EXEMPT_PREFIXES } = require('../helpers/isolationFixtures');
const { ROLES } = require('../../src/utils/constants');

const routes = listRoutes(app).map((r) => ({ ...r, path: r.path.replace(/\/$/, '') || '/' }));
const normKey = (r) => `${r.method} ${r.path}`;

// `/me` routes resolve the record from the caller's own token, never from input.
const ME = /(^|\/)me(\/|$)/;

const exemptReason = (r) =>
  (ME.test(r.path) ? 'own identity from the token' : undefined) ??
  EXEMPT[normKey(r)] ??
  EXEMPT[`${r.method} ${r.path}/`] ??
  Object.entries(EXEMPT_PREFIXES).find(([prefix]) => r.path.startsWith(prefix))?.[1];

const mountOf = (r) => Object.keys(FIXTURES).find((m) => r.path === m || r.path.startsWith(`${m}/`));

const covered = routes.filter((r) => !exemptReason(r));
const mounts = Object.keys(FIXTURES);

/** Fixture keys are written `METHOD /path/`-free; look up with either spelling. */
const pick = (map = {}, r) => map[normKey(r)] ?? map[`${r.method} ${r.path}/`];

const fill = (path, ids) =>
  path.replace(/:(\w+)/g, (_, name) => {
    if (ids[name] === undefined) throw new Error(`fixture is missing :${name} for ${path}`);
    return encodeURIComponent(ids[name]);
  });

describe('tenant isolation: coverage', () => {
  it('every mounted route has an isolation fixture or an explicit EXEMPT reason', () => {
    const uncovered = covered.filter((r) => !mountOf(r)).map(normKey);
    expect(uncovered).toEqual([]);
  });

  it('exempt entries still point at a mounted route', () => {
    const mounted = new Set(routes.map(normKey));
    const stale = Object.keys(EXEMPT).filter((k) => {
      const [method, path] = k.split(' ');
      return !mounted.has(k) && !mounted.has(`${method} ${path.replace(/\/$/, '') || '/'}`);
    });
    expect(stale).toEqual([]);
  });
});

describe('tenant isolation: tenant B against tenant A data', () => {
  it.each(mounts)('%s never exposes tenant A data to tenant B', async (mount) => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    const fixture = await FIXTURES[mount]({ tenant: tenantA });
    const { ids = {}, bodies, roles, expect: expected, queries, extra = [] } = fixture;

    // Anything of tenant A's that must never appear in a tenant-B body.
    const secrets = [
      ...Object.values(ids).filter((v) => /^[a-f0-9]{24}$/.test(String(v))),
      ...extra,
      String(tenantA.organization._id),
      String(tenantA.branch._id),
    ];

    const actors = {};
    const actorFor = async (role) =>
      (actors[role] ??= await createActor(role, { tenant: tenantB }));

    const failures = [];
    for (const route of covered.filter((r) => mountOf(r) === mount)) {
      const isById = route.path.includes(':');
      if (!isById && route.method !== 'GET') continue; // creates: stamped by the plugin, see contextBinding

      const key = normKey(route);
      const actor = await actorFor(pick(roles, route) ?? ROLES.ADMIN);
      const path = fill(route.path, ids);
      const verb = route.method.toLowerCase();
      const query = pick(queries, route) ?? '';
      const req = api()[verb](url(query ? `${path}?${query}` : path)).set(actor.headers);
      const hasBody = ['post', 'put', 'patch'].includes(verb);
      const res = await (hasBody ? req.send(pick(bodies, route) ?? {}) : req);

      const allowed = pick(expected, route) ?? (isById ? [404] : [200]);
      const text = JSON.stringify(res.body);
      const leaked = secrets.filter((s) => text.includes(s));

      if (!allowed.includes(res.status)) {
        const why = res.body?.error?.details ? JSON.stringify(res.body.error.details) : text;
        failures.push(`${key}: got ${res.status} ${why.slice(0, 200)}; expected ${allowed}`);
      } else if (leaked.length) {
        failures.push(`${key}: response contains tenant A ids ${leaked}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('list endpoints return only the caller organisation, with two tenants holding 3 records each', async () => {
    const [tenantA, tenantB] = [await makeTenant(), await makeTenant()];
    const names = { A: [], B: [] };
    for (const [label, tenant] of [['A', tenantA], ['B', tenantB]]) {
      for (let i = 0; i < 3; i += 1) {
        const bed = await require('../helpers/factories').createBed({ tenant });
        names[label].push(String(bed._id));
      }
    }
    const admin = await createActor(ROLES.ADMIN, { tenant: tenantB });
    const res = await api().get(url('/beds')).set(admin.headers);
    const returned = JSON.stringify(res.body);
    names.B.forEach((id) => expect(returned).toContain(id));
    names.A.forEach((id) => expect(returned).not.toContain(id));
  });

  it('a tenant-A id is 404 for a tenant-B token on nested resources', async () => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    const { ids } = await FIXTURES['/patients']({ tenant: tenantA });
    const admin = await createActor(ROLES.ADMIN, { tenant: tenantB });
    for (const path of [
      `/patients/${ids.patientId}/care-team`,
      `/care-logs/patient/${ids.patientId}`,
      `/medical-records/patient/${ids.patientId}`,
      `/appointments/patient/${ids.patientId}`,
      `/bills/patient/${ids.patientId}`,
      `/emergencies/patient/${ids.patientId}`,
    ]) {
      const res = await api().get(url(path)).set(admin.headers);
      expect([path, res.status]).toEqual([path, 404]);
    }
  });
});
