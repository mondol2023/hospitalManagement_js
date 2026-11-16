/**
 * Contract test: every request the frontend's API layer can make must match a
 * route the backend actually mounts.
 *
 * Type-checking cannot catch this. `api.get('/billing')` is a perfectly valid
 * string, and it shipped for the whole billing module while the backend mounted
 * the router at `/bills` — every billing request was a 404.
 *
 * The backend is read as source text (mount table in `routes/index.js`, then the
 * `router.<verb>('/path')` calls in each router file) so the frontend suite
 * needs neither a running server nor a build of the backend. If the backend
 * layout changes enough that parsing finds nothing, the sanity test below fails
 * loudly instead of letting this suite pass vacuously.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';

import { describe, expect, it } from 'vitest';

// jsdom replaces the global URL, so `import.meta.url` can't be resolved here; `vitest run` always starts in
// the frontend package root.
const FRONTEND_FEATURES = resolve(cwd(), 'src/features');
const BACKEND_ROUTES = resolve(cwd(), '../backend/src/routes');

type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Route {
  verb: Verb;
  /** Full path under /api/v1, with every `:param` and `${expr}` collapsed to `:p`. */
  pattern: string;
}

/** `/bills/patient/${patientId}/from-care` and `/bills/patient/:patientId/from-care` compare equal. */
function normalise(path: string): string {
  const cleaned = path.replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z_]\w*/g, ':p');
  return cleaned.length > 1 ? cleaned.replace(/\/+$/, '') : cleaned;
}

function join2(mount: string, sub: string): string {
  return normalise(sub === '/' ? mount : `${mount}${sub}`);
}

function readBackendRoutes(): Route[] {
  const index = readFileSync(join(BACKEND_ROUTES, 'index.js'), 'utf8');
  const mounts = [...index.matchAll(/\{\s*path:\s*'([^']+)',\s*router:\s*(\w+)\s*\}/g)].map((m) => ({
    mount: m[1]!,
    file: `${m[2]!}.js`,
  }));

  const routes: Route[] = [];
  for (const { mount, file } of mounts) {
    const source = readFileSync(join(BACKEND_ROUTES, file), 'utf8');

    // router.get('/x', ...)  — the path is the first argument, on the same line or the next.
    for (const m of source.matchAll(/\brouter\s*\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      routes.push({ verb: m[1] as Verb, pattern: join2(mount, m[2]!) });
    }

    // router.route('/x').get(...).post(...)  — one statement, several verbs.
    for (const m of source.matchAll(/\brouter\s*\.route\(\s*'([^']*)'\s*\)([^;]*);/g)) {
      for (const v of m[2]!.matchAll(/\.(get|post|put|patch|delete)\(/g)) {
        routes.push({ verb: v[1] as Verb, pattern: join2(mount, m[1]!) });
      }
    }
  }
  return routes;
}

interface Call {
  file: string;
  verb: Verb;
  pattern: string;
  raw: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

function readFrontendCalls(): Call[] {
  const files = walk(FRONTEND_FEATURES).filter((f) => /[\\/]api[\\/]/.test(f));
  const calls: Call[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // api.get<Type>('/path' …) / api.page<Page<X>>(`/path/${id}` …). `page` is a GET returning an envelope.
    const re = /\bapi\s*\.(get|post|put|patch|delete|page)\s*(?:<[^()]*?>)?\s*\(\s*([`'])([^`']*)\2/g;
    for (const m of source.matchAll(re)) {
      const verb = (m[1] === 'page' ? 'get' : m[1]) as Verb;
      calls.push({ file: file.slice(FRONTEND_FEATURES.length + 1), verb, pattern: normalise(m[3]!), raw: m[3]! });
    }
  }
  return calls;
}

describe('frontend API calls match backend routes', () => {
  const routes = readBackendRoutes();
  const calls = readFrontendCalls();

  it('parses a plausible number of routes and calls (guards against a vacuous pass)', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(calls.length).toBeGreaterThan(100);
  });

  it('mounts billing at /bills, which is what the frontend must use', () => {
    expect(routes.some((r) => r.pattern.startsWith('/bills'))).toBe(true);
    expect(routes.some((r) => r.pattern.startsWith('/billing'))).toBe(false);
  });

  it('every call has a backend route with the same verb and shape', () => {
    const known = new Set(routes.map((r) => `${r.verb} ${r.pattern}`));
    const missing = calls
      .filter((c) => !known.has(`${c.verb} ${c.pattern}`))
      .map((c) => `${c.verb.toUpperCase()} ${c.raw}  (${c.file})`);

    expect(missing, `Frontend calls with no matching backend route:\n${missing.join('\n')}`).toEqual([]);
  });
});
