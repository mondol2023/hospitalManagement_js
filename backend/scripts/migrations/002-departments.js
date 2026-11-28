'use strict';

/**
 * 002: department / ward text -> Department references.
 *
 * Raw driver only. Only documents whose field is still a string are touched, so
 * re-running is safe. Original text is kept in `legacy*` for one release.
 * Spec: docs/superpowers/specs/2026-11-28-phase0-a-task14-departments.md
 */

const fs = require('node:fs');
const path = require('node:path');
const models = require('../../src/models');

const SOURCE = '002-departments';
const BATCH = 1000;
const CSV_NAME = 'department-mapping.csv';
const coll = (model) => models[model].collection.name;

// `branchFrom`: where a document's branch comes from.
const TARGETS = [
  { model: 'Bed', field: 'ward', legacy: 'legacyWard', branchFrom: 'self' },
  { model: 'Doctor', field: 'department', legacy: 'legacyDepartment', branchFrom: 'user' },
  { model: 'Nurse', field: 'department', legacy: 'legacyDepartment', branchFrom: 'user' },
  { model: 'Staff', field: 'department', legacy: 'legacyDepartment', branchFrom: 'user' },
  { model: 'Conversation', field: 'department', legacy: 'legacyDepartment', branchFrom: 'org' },
];

const clean = (v) => String(v).trim().replace(/\s+/g, ' ');
const fold = (v) => clean(v).toLowerCase();
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** `Cardiology & Heart` -> `CARDIOLOGYAN` (A-Z0-9, max 12), made unique by a numeric suffix. */
function makeCode(name, taken) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DEPT';
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base}${n}`;
  taken.add(code);
  return code;
}

async function up({ db, log, outDir = process.cwd() }) {
  const departments = db.collection(coll('Department'));
  const rows = new Map(); // `${branch}|${original}` -> csv row
  const orgDefaults = new Map();
  const known = new Map(); // `${org}|${branch}` -> { byName: Map, codes: Set }

  const defaultBranchOf = async (orgId) => {
    const key = String(orgId);
    if (!orgDefaults.has(key)) {
      const org = await db.collection(coll('Organization')).findOne({ _id: orgId });
      let branch = org && org.defaultRegistrationBranch;
      if (!branch) branch = (await db.collection(coll('Branch')).findOne({ organization: orgId }))?._id;
      orgDefaults.set(key, branch);
    }
    return orgDefaults.get(key);
  };

  const registryFor = async (orgId, branchId) => {
    const key = `${orgId}|${branchId}`;
    if (!known.has(key)) {
      const existing = await departments.find({ organization: orgId, branch: branchId }).toArray();
      known.set(key, {
        byName: new Map(existing.map((d) => [fold(d.name), d])),
        codes: new Set(existing.map((d) => d.code)),
      });
    }
    return known.get(key);
  };

  // One Department per folded name per branch; reuses an existing one.
  const departmentFor = async (orgId, branchId, original) => {
    const registry = await registryFor(orgId, branchId);
    const hit = registry.byName.get(fold(original));
    if (hit) return hit;
    const name = clean(original);
    const now = new Date();
    const doc = {
      organization: orgId,
      branch: branchId,
      name,
      code: makeCode(name, registry.codes),
      type: 'clinical',
      isActive: true,
      source: SOURCE,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    const { insertedId } = await departments.insertOne(doc);
    registry.byName.set(fold(name), { ...doc, _id: insertedId });
    return registry.byName.get(fold(name));
  };

  for (const { model, field, legacy, branchFrom } of TARGETS) {
    const collection = db.collection(coll(model));
    const cursor = collection
      .find({ [field]: { $type: 'string' } }, { projection: { organization: 1, branch: 1, user: 1, [field]: 1 } })
      .sort({ _id: 1 });

    let batch = [];
    let changed = 0;
    const flush = async () => {
      if (!batch.length) return;
      const userBranch = new Map();
      if (branchFrom === 'user') {
        const users = await db
          .collection(coll('User'))
          .find({ _id: { $in: batch.map((d) => d.user) } }, { projection: { defaultBranch: 1 } })
          .toArray();
        for (const u of users) userBranch.set(String(u._id), u.defaultBranch);
      }

      const ops = [];
      for (const doc of batch) {
        const original = doc[field];
        if (!clean(original)) {
          // Blank text: nothing to reference. Staff drop the field; a bed keeps it for review.
          if (branchFrom !== 'self') {
            ops.push({ updateOne: { filter: { _id: doc._id }, update: { $unset: { [field]: '' }, $set: { [legacy]: original } } } });
          }
          continue;
        }
        let branchId = branchFrom === 'self' ? doc.branch : userBranch.get(String(doc.user));
        if (!branchId) branchId = await defaultBranchOf(doc.organization);
        if (!branchId) continue; // no branch to hang a department on
        const dept = await departmentFor(doc.organization, branchId, original);
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [field]: dept._id, [legacy]: original } } } });
        rows.set(`${branchId}|${original}`, { branchId, original, id: dept._id, name: dept.name });
      }
      if (ops.length) await collection.bulkWrite(ops, { ordered: false });
      changed += ops.length;
      batch = [];
    };

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    if (changed) log.info(`002: converted ${changed} in ${coll(model)}`);
  }

  if (rows.size) {
    const branches = await db.collection(coll('Branch')).find({}, { projection: { code: 1 } }).toArray();
    const codeOf = new Map(branches.map((b) => [String(b._id), b.code]));
    const lines = ['branch,originalValue,departmentId,departmentName'];
    for (const r of rows.values()) {
      lines.push([codeOf.get(String(r.branchId)) || r.branchId, r.original, r.id, r.name].map(csvCell).join(','));
    }
    fs.writeFileSync(path.join(outDir, CSV_NAME), `${lines.join('\n')}\n`);
    log.info(`002: wrote ${CSV_NAME} (${rows.size} rows)`);
  }
  log.info('002: up complete');
}

async function down({ db, log }) {
  for (const { model, field, legacy } of TARGETS) {
    await db
      .collection(coll(model))
      .updateMany({ [legacy]: { $exists: true } }, [{ $set: { [field]: `$${legacy}` } }, { $unset: legacy }]);
  }
  const { deletedCount } = await db.collection(coll('Department')).deleteMany({ source: SOURCE });
  log.info(`002: down complete, removed ${deletedCount} departments`);
}

module.exports = { up, down };
