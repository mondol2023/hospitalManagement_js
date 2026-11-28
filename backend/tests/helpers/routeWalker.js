'use strict';

/**
 * Lists every route mounted on an Express app, with its full path.
 *
 * Express 4 keeps no mount path on a router layer, only a regexp, so the prefix
 * is recovered from `regexp.source`. A mount with a path parameter would need
 * `layer.keys`; none exist, so one is refused loudly rather than guessed.
 */
function mountPrefix(layer) {
  if (layer.regexp.fast_slash) return '';
  if (layer.keys && layer.keys.length) {
    throw new Error(`routeWalker: parameterised mount not supported: ${layer.regexp.source}`);
  }
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
}

function walk(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.handle && layer.handle.stack) {
      walk(layer.handle.stack, prefix + mountPrefix(layer), out);
    }
  }
}

/** @returns {{method: string, path: string, key: string}[]} */
function listRoutes(app) {
  const out = [];
  walk(app._router.stack, '', out);
  return out
    .filter((r) => r.path.startsWith('/api/v1'))
    .map((r) => {
      const path = r.path.replace('/api/v1', '') || '/';
      return { method: r.method, path, key: `${r.method} ${path}` };
    });
}

module.exports = { listRoutes };
