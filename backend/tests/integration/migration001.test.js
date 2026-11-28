'use strict';

const { mongoose, ensureIndexes } = require('../../src/config/database');
const models = require('../../src/models');
const migration = require('../../scripts/migrations/001-default-tenant');

const silent = { info() {}, warn() {}, error() {} };
const oid = () => new mongoose.Types.ObjectId();
const name = (model) => models[model].collection.name;

describe('migration 001-default-tenant', () => {
  let db;
  const col = (model) => db.collection(name(model));
  const run = (fn) => migration[fn]({ db, log: silent });
  const indexNames = async (model) => (await col(model).indexes()).map((i) => i.name);
  const indexByName = async (model, n) => (await col(model).indexes()).find((i) => i.name === n);

  beforeAll(() => {
    db = mongoose.connection.db;
  });

  // Put the database in its pre-tenancy shape: old unique indexes, no tenancy docs.
  beforeEach(async () => {
    await run('down');
    await db.collection(name('Organization')).deleteMany({});
    await db.collection(name('Branch')).deleteMany({});
  });

  // Indexes are shared by every file in the worker: rebuild the current ones.
  afterAll(async () => {
    await db.dropDatabase();
    await ensureIndexes();
  });

  async function seed() {
    const staff = { _id: oid(), name: 'Dr', email: 'a@x.com', role: 'doctor' };
    const patientUser = { _id: oid(), name: 'P', email: 'p@x.com', role: 'patient' };
    await col('User').insertMany([staff, patientUser]);
    await col('Patient').insertMany([
      { _id: oid(), user: patientUser._id, medicalRecordNumber: 'MRN1', isAdmitted: true },
      { _id: oid(), user: oid(), medicalRecordNumber: 'MRN2', isAdmitted: false },
    ]);
    await col('Bed').insertOne({ bedNumber: 'B1', ward: 'W' });
    await col('Medicine').insertOne({ name: 'M', batchNumber: 'X' });
    await col('Bill').insertOne({ invoiceNumber: 'INV1' });
    await col('Analytics').insertOne({ metric: 'm', period: 'day', recordedAt: new Date(0) });
    return { staff, patientUser };
  }

  it('up creates organisation DEFAULT and branch MAIN and sets defaultRegistrationBranch', async () => {
    await run('up');
    const org = await db.collection(name('Organization')).findOne({ code: 'DEFAULT' });
    const branch = await db.collection(name('Branch')).findOne({ code: 'MAIN' });
    expect(org).toBeTruthy();
    expect(branch.organization).toEqual(org._id);
    expect(org.defaultRegistrationBranch).toEqual(branch._id);
  });

  it('up stamps organization on every document and branch on branch-scoped ones', async () => {
    await seed();
    await run('up');
    const org = await db.collection(name('Organization')).findOne({});
    const branch = await db.collection(name('Branch')).findOne({});
    expect(await col('User').countDocuments({ organization: org._id })).toBe(2);
    expect(await col('Patient').countDocuments({ organization: org._id })).toBe(2);
    const bed = await col('Bed').findOne({});
    expect(bed.organization).toEqual(org._id);
    expect(bed.branch).toEqual(branch._id);
    expect(await col('User').findOne({ role: 'patient' })).not.toHaveProperty('branch');
  });

  it('up sets User.branches and defaultBranch for staff, registeredAtBranch for patients, admittedBranch for admitted patients', async () => {
    const { staff, patientUser } = await seed();
    await run('up');
    const branch = await db.collection(name('Branch')).findOne({});
    const s = await col('User').findOne({ _id: staff._id });
    expect(s.branches).toEqual([branch._id]);
    expect(s.defaultBranch).toEqual(branch._id);
    expect(await col('User').findOne({ _id: patientUser._id })).not.toHaveProperty('branches');
    expect(await col('Patient').countDocuments({ registeredAtBranch: branch._id })).toBe(2);
    const admitted = await col('Patient').find({ admittedBranch: branch._id }).toArray();
    expect(admitted).toHaveLength(1);
    expect(admitted[0].medicalRecordNumber).toBe('MRN1');
  });

  it('up drops the old unique indexes and builds the compound ones', async () => {
    expect(await indexNames('User')).toContain('email_1');
    await run('up');
    expect(await indexNames('User')).not.toContain('email_1');
    expect((await indexByName('User', 'organization_1_email_1')).unique).toBe(true);
    expect(await indexNames('Patient')).not.toContain('medicalRecordNumber_1');
    expect(await indexByName('Patient', 'organization_1_medicalRecordNumber_1')).toBeTruthy();
    expect(await indexNames('Bill')).not.toContain('invoiceNumber_1');
    expect(await indexByName('Bill', 'organization_1_invoiceNumber_1')).toBeTruthy();
    expect(await indexNames('Bed')).not.toContain('ward_1_bedNumber_1');
    expect(await indexByName('Bed', 'organization_1_branch_1_ward_1_bedNumber_1')).toBeTruthy();
    expect(await indexNames('Medicine')).not.toContain('name_1_batchNumber_1');
    expect(await indexByName('Medicine', 'organization_1_branch_1_name_1_batchNumber_1')).toBeTruthy();
    const slot = await indexByName('Appointment', 'uniq_doctor_slot_active');
    expect(slot.key).toEqual({ organization: 1, branch: 1, doctor: 1, scheduledAt: 1 });
  });

  it('up is idempotent: a second run changes nothing', async () => {
    await seed();
    await run('up');
    const snapshot = async () => ({
      orgs: await db.collection(name('Organization')).find().toArray(),
      branches: await db.collection(name('Branch')).find().toArray(),
      users: await col('User').find().sort({ _id: 1 }).toArray(),
      idx: await indexNames('User'),
    });
    const first = await snapshot();
    await run('up');
    expect(await snapshot()).toEqual(first);
  });

  it('up stamps in batches of 1000', async () => {
    await col('Notification').insertMany(Array.from({ length: 2500 }, () => ({ title: 't' })));
    const spy = jest.spyOn(Object.getPrototypeOf(col('Notification')), 'bulkWrite');
    await run('up');
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(3);
    expect(await col('Notification').countDocuments({ organization: { $exists: false } })).toBe(0);
  });

  it('two users with the same email can exist in different organisations after up', async () => {
    await run('up');
    const email = 'same@x.com';
    await col('User').insertOne({ organization: oid(), email });
    await expect(col('User').insertOne({ organization: oid(), email })).resolves.toBeTruthy();
    const org = await db.collection(name('Organization')).findOne({});
    await col('User').insertOne({ organization: org._id, email: 'dup@x.com' });
    await expect(col('User').insertOne({ organization: org._id, email: 'dup@x.com' })).rejects.toThrow(/duplicate/i);
  });

  it('down unsets the fields and restores the old indexes', async () => {
    const { staff } = await seed();
    await run('up');
    await run('down');
    const s = await col('User').findOne({ _id: staff._id });
    expect(s).not.toHaveProperty('organization');
    expect(s).not.toHaveProperty('branches');
    expect(await col('Bed').findOne({})).not.toHaveProperty('branch');
    expect(await col('Patient').countDocuments({ admittedBranch: { $exists: true } })).toBe(0);
    expect((await indexByName('User', 'email_1')).unique).toBe(true);
    expect(await indexNames('User')).not.toContain('organization_1_email_1');
    expect(await indexByName('Bed', 'ward_1_bedNumber_1')).toBeTruthy();
    const slot = await indexByName('Appointment', 'uniq_doctor_slot_active');
    expect(slot.key).toEqual({ doctor: 1, scheduledAt: 1 });
  });

  it('down refuses to run when more than one organisation exists', async () => {
    await run('up');
    await db.collection(name('Organization')).insertOne({ name: 'Other', code: 'OTHER' });
    await expect(run('down')).rejects.toThrow(/more than one organisation/);
    await db.collection(name('Organization')).deleteOne({ code: 'OTHER' });
  });
});
