'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { makeTenant, TEST_BRANCH_ID } = require('../helpers/tenant');
const { ROLES } = require('../../src/utils/constants');

const MISSING_ID = '507f1f77bcf86cd799439011';
let seq = 0;
const code = (prefix) => `${prefix}${(seq += 1)}`;

describe('organization — own profile', () => {
  it('admin reads and updates the organisation; code and plan are not writable', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    const before = await api().get(url('/organization')).set(headers);
    expectOk(before);

    const res = await api()
      .patch(url('/organization'))
      .set(headers)
      .send({ name: 'Renamed Group', timezone: 'Asia/Dubai', code: 'HACK', plan: 'enterprise', status: 'active' });
    expectOk(res);
    expect(res.body.data).toMatchObject({
      name: 'Renamed Group',
      timezone: 'Asia/Dubai',
      code: before.body.data.code,
      plan: before.body.data.plan,
      status: before.body.data.status,
    });
  });

  it('an empty PATCH is a 422', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    expectError(await api().patch(url('/organization')).set(headers).send({}), 422);
  });

  it('manager can read but not update', async () => {
    const { headers } = await createActor(ROLES.MANAGER);
    expectOk(await api().get(url('/organization')).set(headers));
    expectError(await api().patch(url('/organization')).set(headers).send({ name: 'X' }), 403);
  });

  it('other staff and patients cannot read it', async () => {
    for (const role of [ROLES.DOCTOR, ROLES.PATIENT]) {
      const { headers } = await createActor(role);
      expectError(await api().get(url('/organization')).set(headers), 403);
    }
  });

  it("each admin sees only their own organisation", async () => {
    const other = await makeTenant();
    const mine = await createActor(ROLES.ADMIN);
    const theirs = await createActor(ROLES.ADMIN, { tenant: other });
    const a = await api().get(url('/organization')).set(mine.headers);
    const b = await api().get(url('/organization')).set(theirs.headers);
    expect(a.body.data.id).not.toBe(b.body.data.id);
    expect(b.body.data.code).toBe(other.organization.code);
  });
});

describe('branches', () => {
  it('admin creates a branch; code is unique per organisation; another tenant can reuse it', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    const branchCode = code('BR');
    const res = await api().post(url('/branches')).set(headers).send({ name: 'North', code: branchCode.toLowerCase() });
    expectOk(res, 201);
    expect(res.body.data).toMatchObject({ code: branchCode, type: 'hospital', isActive: true });

    expectError(await api().post(url('/branches')).set(headers).send({ name: 'Dup', code: branchCode }), 409);

    const other = await makeTenant();
    const otherAdmin = await createActor(ROLES.ADMIN, { tenant: other });
    expectOk(await api().post(url('/branches')).set(otherAdmin.headers).send({ name: 'North', code: branchCode }), 201);
  });

  it('non-admin staff cannot create or update', async () => {
    const { headers } = await createActor(ROLES.DOCTOR);
    expectError(await api().post(url('/branches')).set(headers).send({ name: 'X', code: 'XX' }), 403);
    expectError(await api().patch(url(`/branches/${TEST_BRANCH_ID}`)).set(headers).send({ name: 'X' }), 403);
  });

  it('admin lists all branches; other staff see only their own memberships', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await api().post(url('/branches')).set(admin.headers).send({ name: 'Second', code: code('SB') }).expect(201);

    const adminList = await api().get(url('/branches')).set(admin.headers);
    expect(adminList.body.data.length).toBeGreaterThanOrEqual(2);

    const nurse = await createActor(ROLES.NURSE);
    const nurseList = await api().get(url('/branches')).set(nurse.headers);
    expectOk(nurseList);
    expect(nurseList.body.data.map((b) => b.id)).toEqual([String(TEST_BRANCH_ID)]);
  });

  it('patients cannot list branches', async () => {
    const { headers } = await createActor(ROLES.PATIENT);
    expectError(await api().get(url('/branches')).set(headers), 403);
  });

  it('admin updates a branch; code stays immutable', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    const created = await api().post(url('/branches')).set(headers).send({ name: 'Old', code: code('UB') });
    const id = created.body.data.id;
    const res = await api()
      .patch(url(`/branches/${id}`))
      .set(headers)
      .send({ name: 'New', type: 'clinic', code: 'CHANGED' });
    expectOk(res);
    expect(res.body.data).toMatchObject({ name: 'New', type: 'clinic', code: created.body.data.code });
  });

  it("another tenant's branch id is 404 on PATCH", async () => {
    const other = await makeTenant();
    const { headers } = await createActor(ROLES.ADMIN);
    expectError(await api().patch(url(`/branches/${other.branch._id}`)).set(headers).send({ name: 'X' }), 404);
    expectError(await api().patch(url(`/branches/${MISSING_ID}`)).set(headers).send({ name: 'X' }), 404);
  });

  it('the default registration branch cannot be deactivated', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    expectError(
      await api().patch(url(`/branches/${TEST_BRANCH_ID}`)).set(headers).send({ isActive: false }),
      409,
      'DEFAULT_BRANCH_REQUIRED'
    );
    const created = await api().post(url('/branches')).set(headers).send({ name: 'Temp', code: code('TB') });
    const res = await api().patch(url(`/branches/${created.body.data.id}`)).set(headers).send({ isActive: false });
    expect(res.body.data.isActive).toBe(false);
  });
});

describe('departments', () => {
  const create = (headers, overrides = {}) =>
    api()
      .post(url('/departments'))
      .set(headers)
      .send({ branch: String(TEST_BRANCH_ID), name: 'Cardiology', code: code('CD'), ...overrides });

  it('create requires a branch of the same organisation', async () => {
    const other = await makeTenant();
    const { headers } = await createActor(ROLES.ADMIN);
    expectOk(await create(headers), 201);
    expectError(await create(headers, { branch: String(other.branch._id) }), 404);
    expectError(await create(headers, { branch: MISSING_ID }), 404);
  });

  it('department code is unique per branch', async () => {
    const { headers } = await createActor(ROLES.ADMIN);
    const dup = code('DP');
    expectOk(await create(headers, { code: dup }), 201);
    expectError(await create(headers, { code: dup }), 409);
  });

  it('list filters by branch and any staff can read', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const second = await api().post(url('/branches')).set(admin.headers).send({ name: 'B2', code: code('LB') });
    await create(admin.headers);
    await create(admin.headers, { branch: second.body.data.id });

    const nurse = await createActor(ROLES.NURSE);
    const all = await api().get(url('/departments')).set(nurse.headers);
    expectOk(all);
    expect(all.body.data).toHaveLength(2);

    const filtered = await api().get(url('/departments')).query({ branch: second.body.data.id }).set(nurse.headers);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].branch).toBe(second.body.data.id);
  });

  it('only admins write; patients cannot read', async () => {
    const nurse = await createActor(ROLES.NURSE);
    expectError(await create(nurse.headers), 403);
    const patient = await createActor(ROLES.PATIENT);
    expectError(await api().get(url('/departments')).set(patient.headers), 403);
  });

  it('admin updates a department; head must be a user of the organisation; code is fixed', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const created = await create(admin.headers);
    const id = created.body.data.id;

    const doctor = await createActor(ROLES.DOCTOR);
    const ok = await api()
      .patch(url(`/departments/${id}`))
      .set(admin.headers)
      .send({ name: 'Heart', head: String(doctor.user._id), code: 'CHANGED' });
    expectOk(ok);
    expect(ok.body.data).toMatchObject({ name: 'Heart', head: String(doctor.user._id), code: created.body.data.code });

    const other = await makeTenant();
    const foreign = await createActor(ROLES.DOCTOR, { tenant: other });
    expectError(
      await api().patch(url(`/departments/${id}`)).set(admin.headers).send({ head: String(foreign.user._id) }),
      404
    );
  });

  it("another tenant's department is 404", async () => {
    const other = await makeTenant();
    const theirs = await createActor(ROLES.ADMIN, { tenant: other });
    const dept = await api()
      .post(url('/departments'))
      .set(theirs.headers)
      .send({ branch: String(other.branch._id), name: 'Theirs', code: 'TH' });
    expectOk(dept, 201);

    const mine = await createActor(ROLES.ADMIN);
    expectError(await api().patch(url(`/departments/${dept.body.data.id}`)).set(mine.headers).send({ name: 'X' }), 404);
    const list = await api().get(url('/departments')).set(mine.headers);
    expect(list.body.data.map((d) => d.id)).not.toContain(dept.body.data.id);
  });
});
