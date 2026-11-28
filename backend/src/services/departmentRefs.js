'use strict';

const { departmentRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const context = require('../utils/context');

/** Populate spec: a department reference is returned as `{ id, name }`. */
const named = (path) => ({ path, select: 'name' });

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Department name -> id, inside the caller's organisation.
 * Case-insensitive; the active branch wins, then any branch. Never creates.
 * `undefined` passes through (field untouched), blank/`null` clears.
 */
async function resolveName(name) {
  if (name === undefined) return undefined;
  const clean = name === null ? '' : String(name).trim().replace(/\s+/g, ' ');
  if (!clean) return null;

  const rows = await departmentRepository.find(
    { name: new RegExp(`^${escapeRegex(clean)}$`, 'i'), isActive: true },
    { projection: 'branch', limit: 50 }
  );
  if (!rows.length) throw ApiError.badRequest(`Unknown department "${clean}"`, { code: 'UNKNOWN_DEPARTMENT' });

  const active = String(context.get()?.branchId || '');
  return (rows.find((r) => String(r.branch) === active) || rows[0])._id;
}

module.exports = { resolveName, named };
