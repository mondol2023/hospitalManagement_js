'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mongoose } = require('../../src/config/database');
const models = require('../../src/models');
const migration = require('../../scripts/migrations/002-departments');
const { TEST_ORG_ID, TEST_BRANCH_ID } = require('../helpers/tenant');
const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, ensureDepartment } = require('../helpers/factories');
const { ROLES } = require('../../src/utils/constants');

const silent = { info() {}, warn() {}, error() {} };
const oid = () => new mongoose.Types.ObjectId();
const name = (model) => models[model].collection.name;

describe('migration 002-departments', () => {
  let db;
  let outDir;
  const col = (model) => db.collection(name(model));
  const run = (fn) => migration[fn]({ db, log: silent, outDir });
  const csv = () => path.join(outDir, 'department-mapping.csv');

  beforeAll(() => {
    db = mongoose.connection.db;
  });
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig002-'));
  });

  // Raw documents in the pre-migration shape (text department / ward).
  async function seed() {
    const user = {
      _id: oid(), name: 'Dr', email: 'd@x.com', role: 'doctor',
      organization: TEST_ORG_ID, defaultBranch: TEST_BRANCH_ID,
    };
    await col('User').insertOne(user);
    const base = { organization: TEST_ORG_ID };
    await col('Doctor').insertMany([
      { ...base, user: user._id, employeeId: 'D1', department: 'Cardiology' },
      { ...base, user: oid(), employeeId: 'D2', department: ' cardiology ' },
      { ...base, user: oid(), employeeId: 'D3', department: 'Cardio' },
    ]);
    await col('Bed').insertMany([
      { ...base, branch: TEST_BRANCH_ID, bedNumber: 'B1', ward: 'ICU' },
      { ...base, branch: TEST_BRANCH_ID, bedNumber: 'B2', ward: 'ICU' },
    ]);
    await col('Conversation').insertOne({ ...base, type: 'staff_only', participants: [oid(), oid()], department: 'ICU' });
  }

  const deptNames = async () => (await col('Department').find({}).toArray()).map((d) => d.name).sort();

  it('creates one department per distinct trimmed, case-folded value per branch', async () => {
    await seed();
    await run('up');
    expect(await deptNames()).toEqual(['Cardio', 'Cardiology', 'ICU']);
  });

  it('keeps original casing of the first occurrence as the name', async () => {
    await seed();
    await run('up');
    const dept = await col('Department').findOne({ name: /^cardiology$/i });
    expect(dept.name).toBe('Cardiology');
  });

  it('writes references and keeps legacy text', async () => {
    await seed();
    await run('up');
    const doc = await col('Doctor').findOne({ employeeId: 'D2' });
    const dept = await col('Department').findOne({ name: 'Cardiology' });
    expect(doc.department).toEqual(dept._id);
    expect(doc.legacyDepartment).toBe(' cardiology ');
    const bed = await col('Bed').findOne({ bedNumber: 'B1' });
    expect(bed.legacyWard).toBe('ICU');
    expect(String(bed.ward)).toBe(String((await col('Department').findOne({ name: 'ICU' }))._id));
  });

  it('writes the mapping CSV with one row per original value', async () => {
    await seed();
    await run('up');
    const lines = fs.readFileSync(csv(), 'utf8').trim().split('\n');
    expect(lines[0]).toBe('branch,originalValue,departmentId,departmentName');
    // 'Cardiology', ' cardiology ', 'Cardio', 'ICU' (shared by beds and the conversation)
    expect(lines).toHaveLength(1 + 4);
  });

  it('is idempotent', async () => {
    await seed();
    await run('up');
    const before = await col('Department').countDocuments();
    fs.rmSync(csv());
    await run('up');
    expect(await col('Department').countDocuments()).toBe(before);
    expect(fs.existsSync(csv())).toBe(false);
  });

  it('reuses an existing department of the same name instead of duplicating it', async () => {
    await seed();
    await col('Department').insertOne({ organization: TEST_ORG_ID, branch: TEST_BRANCH_ID, name: 'icu', code: 'ICU' });
    await run('up');
    expect(await col('Department').countDocuments({ name: /^icu$/i })).toBe(1);
  });

  it('down restores text and removes created departments', async () => {
    await seed();
    await run('up');
    await run('down');
    expect((await col('Doctor').findOne({ employeeId: 'D2' })).department).toBe(' cardiology ');
    const bed = await col('Bed').findOne({ bedNumber: 'B1' });
    expect(bed.ward).toBe('ICU');
    expect(bed.legacyWard).toBeUndefined();
    expect(await col('Department').countDocuments()).toBe(0);
  });
});

describe('departments through the API', () => {
  it('accepts a department name, stores the id, and returns { id, name }', async () => {
    const dept = await ensureDepartment('Cardiology');
    const admin = await createActor(ROLES.ADMIN);
    const res = await api().post(url('/beds')).set(admin.headers).send({ bedNumber: 'X-1', ward: 'cardiology' });
    const bed = expectOk(res, 201);
    expect(bed.ward).toEqual({ id: String(dept._id), name: 'Cardiology' });
    const stored = await models.Bed.findOne({ bedNumber: 'X-1' }).lean();
    expect(String(stored.ward)).toBe(String(dept._id));
  });

  it('rejects an unknown department name with 400 and creates nothing', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const res = await api().post(url('/beds')).set(admin.headers).send({ bedNumber: 'X-2', ward: 'Nowhere' });
    expectError(res, 400);
    expect(await models.Department.countDocuments()).toBe(0);
  });

  it('returns a doctor department as { id, name }', async () => {
    const dept = await ensureDepartment('Oncology');
    const doctor = await createActor(ROLES.DOCTOR, { profile: { department: 'Oncology' } });
    const res = await api().get(url('/doctors/me')).set(doctor.headers);
    expect(expectOk(res).department).toEqual({ id: String(dept._id), name: 'Oncology' });
  });

  it('a list filter by an unknown name is 400', async () => {
    const admin = await createActor(ROLES.ADMIN);
    expectError(await api().get(url('/beds')).query({ ward: 'Nowhere' }).set(admin.headers), 400);
  });
});
