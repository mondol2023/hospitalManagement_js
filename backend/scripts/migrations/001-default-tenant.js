'use strict';

/**
 * 001: move the single-hospital data into one default organisation + branch.
 *
 * Raw driver only (no tenant plugin). Collection names come from the models so
 * a renamed collection cannot drift. Re-running is safe: only documents missing
 * `organization` are stamped, and index steps are no-ops once applied.
 */

const models = require('../../src/models');
const { APPOINTMENT_STATUS, ROLES } = require('../../src/utils/constants');

const BATCH = 1000;
const coll = (model) => models[model].collection.name;

const ORG_SCOPED = ['User', 'Patient', 'Doctor', 'Nurse', 'Staff', 'Conversation', 'Message', 'Notification'];
const BRANCH_SCOPED = [
  'Appointment', 'MedicalRecord', 'CareLog', 'Bed', 'Medicine', 'StockMovement', 'Bill', 'Emergency', 'Analytics',
];

const asString = (field) => ({ partialFilterExpression: { [field]: { $type: 'string' } } });
const liveStatus = { status: { $in: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED] } };

/**
 * `old`: the pre-tenancy unique index (restored by `down`); `next`: its tenant-aware replacement.
 * `name` is the default Mongoose name unless the model names it.
 */
const UNIQUES = [
  { model: 'User', old: { key: { email: 1 } }, next: { key: { organization: 1, email: 1 } } },
  { model: 'Patient', old: { key: { user: 1 } }, next: { key: { organization: 1, user: 1 } } },
  {
    model: 'Patient',
    old: { key: { medicalRecordNumber: 1 } },
    next: { key: { organization: 1, medicalRecordNumber: 1 }, opts: asString('medicalRecordNumber') },
  },
  ...['Doctor', 'Nurse', 'Staff'].flatMap((model) => [
    { model, old: { key: { user: 1 } }, next: { key: { organization: 1, user: 1 } } },
    { model, old: { key: { employeeId: 1 } }, next: { key: { organization: 1, employeeId: 1 } } },
  ]),
  {
    model: 'Bill',
    old: { key: { invoiceNumber: 1 } },
    next: { key: { organization: 1, invoiceNumber: 1 }, opts: asString('invoiceNumber') },
  },
  {
    model: 'Medicine',
    old: { key: { name: 1, batchNumber: 1 } },
    next: { key: { organization: 1, branch: 1, name: 1, batchNumber: 1 } },
  },
  {
    model: 'Bed',
    old: { key: { ward: 1, bedNumber: 1 } },
    next: { key: { organization: 1, branch: 1, ward: 1, bedNumber: 1 } },
  },
  {
    model: 'Analytics',
    old: { key: { metric: 1, period: 1, recordedAt: 1 } },
    next: { key: { organization: 1, branch: 1, metric: 1, period: 1, recordedAt: 1 } },
  },
  {
    model: 'Conversation',
    old: { key: { directKey: 1 }, opts: asString('directKey') },
    next: { key: { organization: 1, directKey: 1 }, opts: asString('directKey') },
  },
  {
    model: 'Appointment',
    old: { key: { doctor: 1, scheduledAt: 1 }, opts: { name: 'uniq_doctor_slot_active', partialFilterExpression: liveStatus } },
    next: {
      key: { organization: 1, branch: 1, doctor: 1, scheduledAt: 1 },
      opts: { name: 'uniq_doctor_slot_active', partialFilterExpression: liveStatus },
    },
  },
  {
    // No pre-tenancy equivalent is restored: `down` only drops it.
    model: 'MedicalRecord',
    old: null,
    next: {
      key: { organization: 1, branch: 1, appointment: 1 },
      opts: { name: 'uniq_record_per_appointment', partialFilterExpression: { appointment: { $type: 'objectId' } } },
    },
  },
];

const defaultName = (key) => Object.entries(key).map(([k, v]) => `${k}_${v}`).join('_');
const nameOf = (spec) => spec.opts?.name || defaultName(spec.key);
const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function listIndexes(db, name) {
  try {
    return await db.collection(name).indexes();
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound' || err.code === 26) return [];
    throw err;
  }
}

async function dropByName(db, collection, name) {
  try {
    await db.collection(collection).dropIndex(name);
  } catch (err) {
    if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
  }
}

async function createUnique(db, collection, spec) {
  await db.collection(collection).createIndex(spec.key, { ...spec.opts, name: nameOf(spec), unique: true });
}

/** Stamp `fields` on documents missing `organization`, 1,000 at a time. */
async function stamp(db, collection, fields, log) {
  const cursor = db.collection(collection).find({ organization: { $exists: false } }, { projection: { _id: 1 } });
  let ids = [];
  let total = 0;
  const flush = async () => {
    if (!ids.length) return;
    await db.collection(collection).bulkWrite([
      { updateMany: { filter: { _id: { $in: ids } }, update: { $set: fields } } },
    ]);
    total += ids.length;
    ids = [];
  };
  for await (const { _id } of cursor) {
    ids.push(_id);
    if (ids.length >= BATCH) await flush();
  }
  await flush();
  if (total) log.info(`001: stamped ${total} in ${collection}`);
}

async function up({ db, log }) {
  const now = new Date();
  const orgs = db.collection(coll('Organization'));
  const branches = db.collection(coll('Branch'));
  const orgCode = (process.env.SEED_ORG_CODE || 'DEFAULT').toUpperCase();
  const branchCode = (process.env.SEED_BRANCH_CODE || 'MAIN').toUpperCase();

  // 1. Organisation and branch.
  await orgs.updateOne(
    { code: orgCode },
    {
      $setOnInsert: {
        name: process.env.SEED_ORG_NAME || 'Default Organization',
        code: orgCode,
        status: 'active',
        plan: 'professional',
        country: 'BD',
        timezone: 'Asia/Dhaka',
        currency: 'BDT',
        locale: 'en',
        createdAt: now,
        updatedAt: now,
        __v: 0,
      },
    },
    { upsert: true }
  );
  const org = await orgs.findOne({ code: orgCode });
  await branches.updateOne(
    { organization: org._id, code: branchCode },
    {
      $setOnInsert: {
        organization: org._id,
        name: process.env.SEED_BRANCH_NAME || 'Main',
        code: branchCode,
        type: 'hospital',
        isActive: true,
        isHeadOffice: true,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      },
    },
    { upsert: true }
  );
  const branch = await branches.findOne({ organization: org._id, code: branchCode });
  await orgs.updateOne(
    { _id: org._id, defaultRegistrationBranch: { $exists: false } },
    { $set: { defaultRegistrationBranch: branch._id } }
  );

  // 2. Stamp every document.
  for (const model of ORG_SCOPED) await stamp(db, coll(model), { organization: org._id }, log);
  for (const model of BRANCH_SCOPED) {
    await stamp(db, coll(model), { organization: org._id, branch: branch._id }, log);
  }

  // 3. Per-collection extras.
  await db.collection(coll('User')).updateMany(
    { role: { $nin: [ROLES.PATIENT, ROLES.PLATFORM_ADMIN] }, branches: { $exists: false } },
    { $set: { branches: [branch._id], defaultBranch: branch._id } }
  );
  const patients = db.collection(coll('Patient'));
  await patients.updateMany({ registeredAtBranch: { $exists: false } }, { $set: { registeredAtBranch: branch._id } });
  await patients.updateMany(
    { isAdmitted: true, admittedBranch: { $exists: false } },
    { $set: { admittedBranch: branch._id } }
  );

  // 4. Indexes last, so unstamped documents can never break a unique build.
  for (const { model, old, next } of UNIQUES) {
    const name = coll(model);
    const existing = await listIndexes(db, name);
    // Old index: by its name, and only while it is still the pre-tenancy shape.
    const oldName = old ? nameOf(old) : nameOf(next);
    const stale = existing.find((i) => i.name === oldName && !sameKey(i.key, next.key));
    if (stale) await dropByName(db, name, oldName);
    await createUnique(db, name, next);
  }
  log.info('001: up complete');
}

async function down({ db, log }) {
  const orgs = db.collection(coll('Organization'));
  if ((await orgs.countDocuments()) > 1) {
    throw new Error('001 down refused: more than one organisation exists');
  }

  for (const { model, next } of UNIQUES) await dropByName(db, coll(model), nameOf(next));

  const unsetOrg = { organization: '' };
  for (const model of ORG_SCOPED) await db.collection(coll(model)).updateMany({}, { $unset: unsetOrg });
  for (const model of BRANCH_SCOPED) {
    await db.collection(coll(model)).updateMany({}, { $unset: { ...unsetOrg, branch: '' } });
  }
  await db.collection(coll('User')).updateMany(
    {},
    { $unset: { branches: '', defaultBranch: '', lastActiveBranch: '' } }
  );
  await db.collection(coll('Patient')).updateMany({}, { $unset: { registeredAtBranch: '', admittedBranch: '' } });
  await db.collection(coll('Branch')).deleteMany({});
  await orgs.deleteMany({});

  for (const { model, old } of UNIQUES) {
    if (old) await createUnique(db, coll(model), old);
  }
  log.info('001: down complete');
}

module.exports = { up, down };
