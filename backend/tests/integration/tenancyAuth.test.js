'use strict';

const mongoose = require('mongoose');
const { api, url, expectError } = require('../helpers/api');
const { createActor, createUser, createBed, DEFAULT_PASSWORD } = require('../helpers/factories');
const { makeTenant, TEST_ORG_ID, TEST_BRANCH_ID } = require('../helpers/tenant');
const context = require('../../src/utils/context');
const tokenService = require('../../src/services/tokenService');
const organizationStatus = require('../../src/services/organizationStatus');
const { resolveActor } = require('../../src/middleware/authenticate');
const { Organization, User, Branch } = require('../../src/models');
const { ROLES } = require('../../src/utils/constants');

const asPlatform = (fn) => context.withoutTenant('test:setup', fn);
const me = (token) => api().get(url('/auth/me')).set('Authorization', `Bearer ${token}`);

describe('tenancy — token and actor resolution', () => {
  it('token whose org differs from the user organization returns 401 TOKEN_INVALID', async () => {
    const other = await makeTenant();
    const { user } = await createActor(ROLES.DOCTOR);
    const forged = tokenService.signAccessToken({
      sub: String(user._id),
      role: user.role,
      org: String(other.organization._id),
      br: String(user.defaultBranch),
    });
    expectError(await me(forged), 401, 'TOKEN_INVALID');
  });

  it('suspended organization returns 403 ORGANIZATION_SUSPENDED', async () => {
    const { token } = await createActor(ROLES.DOCTOR);
    await asPlatform(() => Organization.updateOne({ _id: TEST_ORG_ID }, { status: 'suspended' }));
    organizationStatus.clear(TEST_ORG_ID);
    expectError(await me(token), 403, 'ORGANIZATION_SUSPENDED');
  });

  it('staff token whose br is not in user.branches returns 403 BRANCH_ACCESS_REVOKED', async () => {
    const { user } = await createActor(ROLES.DOCTOR);
    const stray = await asPlatform(() => Branch.create({ organization: TEST_ORG_ID, name: 'X', code: 'XX' }));
    const token = tokenService.signAccessToken({
      sub: String(user._id),
      role: user.role,
      org: String(TEST_ORG_ID),
      br: String(stray._id),
    });
    expectError(await me(token), 403, 'BRANCH_ACCESS_REVOKED');
  });

  it('removing a branch from the user kills an already-issued token on its next request', async () => {
    const { user, token } = await createActor(ROLES.NURSE);
    expect((await me(token)).status).toBe(200);
    await User.updateOne({ _id: user._id }, { $set: { branches: [] } });
    expectError(await me(token), 403, 'BRANCH_ACCESS_REVOKED');
  });

  it('platform_admin token gets bypassTenant and no organization', async () => {
    const admin = await createUser({ role: ROLES.PLATFORM_ADMIN, organization: null, branches: [] });
    const { accessToken } = tokenService.issueTokens(admin);
    await context.run({ source: 'http' }, async () => {
      const actor = await resolveActor(accessToken);
      expect(actor.organizationId).toBeNull();
      expect(context.get()).toMatchObject({ bypassTenant: true, bypassReason: 'platform_admin' });
    });
  });

  it('resolveActor makes exactly one withoutTenant call', async () => {
    const { token } = await createActor(ROLES.DOCTOR);
    const spy = jest.spyOn(context, 'withoutTenant');
    try {
      await context.run({ source: 'http' }, () => resolveActor(token));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('tenancy: organisation resolution at login and registration', () => {
  const login = (body, host) => {
    const req = api().post(url('/auth/login'));
    if (host) req.set('Host', host);
    return req.send(body);
  };
  const signup = (overrides = {}) => ({
    name: 'Pat Ient',
    email: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hospital.test`,
    password: DEFAULT_PASSWORD,
    profile: {
      age: 30,
      gender: 'female',
      emergencyContact: { name: 'Kin', relationship: 'sibling', phone: '+15550002222' },
    },
    ...overrides,
  });

  it('login by organizationCode, by host, and by unique email all succeed', async () => {
    const user = await createUser();
    const byCode = await login({ email: user.email, password: DEFAULT_PASSWORD, organizationCode: 'test' });
    expect(byCode.status).toBe(200);
    const byEmail = await login({ email: user.email, password: DEFAULT_PASSWORD });
    expect(byEmail.status).toBe(200);

    const t = await makeTenant({ subdomain: 'hostco' });
    const u = await createUser({ tenant: t });
    const byHost = await login({ email: u.email, password: DEFAULT_PASSWORD }, 'hostco.hms.test');
    expect(byHost.status).toBe(200);
  });

  it('login email is case- and whitespace-insensitive across resolution', async () => {
    const user = await createUser();
    const res = await login({ email: `  ${user.email.toUpperCase()} `, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
  });

  describe('same email in two organisations', () => {
    const email = `dup-${Date.now()}@hospital.test`;
    let other;
    beforeEach(async () => {
      other = await makeTenant();
    });

    it('wrong password gives 401, not 409', async () => {
      await createUser({ email });
      await createUser({ email, tenant: other });
      expectError(await login({ email, password: 'Wrong-Pass-1!' }), 401, 'INVALID_CREDENTIALS');
    });

    it('same password in both gives 409 ORGANIZATION_REQUIRED', async () => {
      await createUser({ email });
      await createUser({ email, tenant: other });
      expectError(await login({ email, password: DEFAULT_PASSWORD }), 409, 'ORGANIZATION_REQUIRED');
    });

    it('password matching one organisation only logs into that one', async () => {
      await createUser({ email });
      await createUser({ email, tenant: other, password: 'Other-Pass-123!' });
      const res = await login({ email, password: 'Other-Pass-123!' });
      expect(res.status).toBe(200);
      expect(tokenService.verifyAccessToken(res.body.data.accessToken).org).toBe(
        String(other.organization._id)
      );
    });
  });

  it('login to a suspended organisation gives 403 ORGANIZATION_SUSPENDED', async () => {
    const t = await makeTenant();
    const u = await createUser({ tenant: t });
    await asPlatform(() => Organization.updateOne({ _id: t.organization._id }, { status: 'suspended' }));
    organizationStatus.clear(t.organization._id);
    expectError(await login({ email: u.email, password: DEFAULT_PASSWORD }), 403, 'ORGANIZATION_SUSPENDED');
  });

  it('register without organisation gives 400; with a code lands at the default registration branch', async () => {
    expectError(await api().post(url('/auth/register')).send(signup()), 400, 'ORGANIZATION_REQUIRED');

    const t = await makeTenant();
    const res = await api()
      .post(url('/auth/register'))
      .send(signup({ organizationCode: t.organization.code }));
    expect(res.status).toBe(201);
    const claims = tokenService.verifyAccessToken(res.body.data.accessToken);
    expect(claims.org).toBe(String(t.organization._id));
    expect(claims.br).toBe(String(t.branch._id));
    const patient = await mongoose.connection
      .collection('patients')
      .findOne({ user: new mongoose.Types.ObjectId(res.body.data.user.id) });
    expect(String(patient.registeredAtBranch)).toBe(String(t.branch._id));
  });

  it('the same email can register in two organisations', async () => {
    const t = await makeTenant();
    const body = signup();
    const a = await api().post(url('/auth/register')).send({ ...body, organizationCode: 'TEST' });
    const b = await api()
      .post(url('/auth/register'))
      .send({ ...body, organizationCode: t.organization.code });
    expect([a.status, b.status]).toEqual([201, 201]);
  });
});

describe('tenancy: platform admin, candidate cap and timing', () => {
  const post = (path, body) => api().post(url(path)).send(body);

  it('platform admin logs in without an organisation and refreshes', async () => {
    const admin = await createUser({ role: ROLES.PLATFORM_ADMIN, organization: null, branches: [] });
    const res = await post('/auth/login', { email: admin.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
    expect(tokenService.verifyAccessToken(res.body.data.accessToken).org).toBeUndefined();
    const refreshed = await post('/auth/refresh', { refreshToken: res.body.data.refreshToken });
    expect(refreshed.status).toBe(200);
  });

  it('refresh token without org for a non-platform user is rejected', async () => {
    const { user } = await createActor(ROLES.DOCTOR);
    const refreshToken = tokenService.signRefreshToken({ sub: String(user._id), role: user.role });
    expectError(await post('/auth/refresh', { refreshToken }), 401, 'TOKEN_INVALID');
  });

  it('tries at most 5 candidates when 6 organisations share an email', async () => {
    const email = `six-${Date.now()}@hospital.test`;
    for (let i = 0; i < 6; i += 1) {
      const t = await makeTenant();
      await createUser({ email, tenant: t });
    }
    const spy = jest.spyOn(User.prototype, 'comparePassword');
    try {
      const res = await post('/auth/login', { email, password: 'Wrong-Pass-1!' });
      expectError(res, 401, 'INVALID_CREDENTIALS');
      expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    } finally {
      spy.mockRestore();
    }
  });

  it('wrong password against a suspended organisation gives 401, not 403', async () => {
    const t = await makeTenant();
    const u = await createUser({ tenant: t });
    await asPlatform(() => Organization.updateOne({ _id: t.organization._id }, { status: 'suspended' }));
    organizationStatus.clear(t.organization._id);
    const res = await post('/auth/login', { email: u.email, password: 'Wrong-Pass-1!' });
    expectError(res, 401, 'INVALID_CREDENTIALS');
  });
});

describe('tenancy: real limiter key generators (called as express-rate-limit does)', () => {
  const { authKeyGenerator, refreshKeyGenerator } = require('../../src/middleware/rateLimit');
  const base = { ip: '10.0.0.9', headers: {}, hostname: 'localhost' };

  it('adds the org dimension for a known code, not for junk, falls back to host', async () => {
    const known = await authKeyGenerator({ ...base, body: { email: 'a@b.co', organizationCode: 'test' } }, {});
    expect(known).toBe('ip:10.0.0.9|em:a@b.co|org:TEST');
    const junk = await authKeyGenerator({ ...base, body: { email: 'a@b.co', organizationCode: 'NOPE' } }, {});
    expect(junk).toBe('ip:10.0.0.9|em:a@b.co');
    await makeTenant({ subdomain: 'keyco' });
    const viaHost = await authKeyGenerator(
      { ...base, hostname: 'keyco.hms.test', body: { email: 'a@b.co', organizationCode: 'NOPE' } },
      {}
    );
    expect(viaHost).toBe('ip:10.0.0.9|em:a@b.co|org:keyco');
  });

  it('refresh key resolves the token owner', () => {
    const refreshToken = tokenService.signRefreshToken({ sub: 'user-77', role: ROLES.DOCTOR });
    expect(refreshKeyGenerator({ ...base, body: { refreshToken } }, {})).toBe('u:user-77');
  });
});

describe('tenancy: switching branch', () => {
  const switchTo = (token, body) =>
    api().post(url('/auth/switch-branch')).set('Authorization', `Bearer ${token}`).send(body);

  /** A nurse in the default tenant who belongs to the main branch and a second one. */
  async function setup({ secondActive = true } = {}) {
    const second = await asPlatform(() =>
      Branch.create({ organization: TEST_ORG_ID, name: 'Second', code: 'B2', isActive: secondActive })
    );
    const { user } = await createActor(ROLES.NURSE);
    await User.updateOne({ _id: user._id }, { $push: { branches: second._id } });
    const fresh = await User.findById(user._id);
    const tokens = tokenService.issueTokens(fresh, { branchId: TEST_BRANCH_ID });
    return { second, user: fresh, ...tokens };
  }

  it('switch-branch to a member branch returns tokens whose br is the new branch', async () => {
    const { second, user, accessToken, refreshToken } = await setup();
    const res = await switchTo(accessToken, { branchId: String(second._id), refreshToken });
    expect(res.status).toBe(200);
    expect(tokenService.verifyAccessToken(res.body.data.accessToken).br).toBe(String(second._id));
    expect(tokenService.verifyRefreshToken(res.body.data.refreshToken).br).toBe(String(second._id));
    expect(res.body.data.user.tokensValidFrom).toBeUndefined();
    expect(String((await User.findById(user._id)).lastActiveBranch)).toBe(String(second._id));
  });

  it('switch-branch to a non-member branch is 403 BRANCH_ACCESS_REVOKED', async () => {
    const { user, accessToken, refreshToken } = await setup();
    const stray = await asPlatform(() => Branch.create({ organization: TEST_ORG_ID, name: 'S', code: 'ST' }));
    expect(String(user.branches)).not.toContain(String(stray._id));
    expectError(
      await switchTo(accessToken, { branchId: String(stray._id), refreshToken }),
      403,
      'BRANCH_ACCESS_REVOKED'
    );
  });

  it('switch-branch to an unknown or foreign-organisation branch is 404', async () => {
    const { accessToken, refreshToken } = await setup();
    const other = await makeTenant();
    expect((await switchTo(accessToken, { branchId: String(other.branch._id), refreshToken })).status).toBe(404);
    expect((await switchTo(accessToken, { branchId: '507f1f77bcf86cd799439011', refreshToken })).status).toBe(404);
  });

  it('switch-branch to an inactive branch is rejected', async () => {
    const { second, accessToken, refreshToken } = await setup({ secondActive: false });
    expectError(await switchTo(accessToken, { branchId: String(second._id), refreshToken }), 403, 'BRANCH_INACTIVE');
  });

  it('rejects a refresh token that belongs to someone else', async () => {
    const { second, accessToken } = await setup();
    const { user: other } = await createActor(ROLES.NURSE);
    const { refreshToken } = tokenService.issueTokens(other);
    expectError(await switchTo(accessToken, { branchId: String(second._id), refreshToken }), 401, 'TOKEN_INVALID');
  });

  it('after switching, queries see only the new branch data', async () => {
    const { second, accessToken, refreshToken } = await setup();
    const store = { source: 'script', organizationId: TEST_ORG_ID, branchId: second._id, branchIds: [second._id] };
    const here = await createBed({ ward: 'MAINWARD' });
    const there = await createBed({ tenant: { store }, ward: 'SECONDWARD' });

    const list = (token) => api().get(url('/beds')).set('Authorization', `Bearer ${token}`);
    const before = JSON.stringify((await list(accessToken)).body);
    expect(before).toContain(here.bedNumber);
    expect(before).not.toContain(there.bedNumber);

    const switched = await switchTo(accessToken, { branchId: String(second._id), refreshToken });
    const after = JSON.stringify((await list(switched.body.data.accessToken)).body);
    expect(after).toContain(there.bedNumber);
    expect(after).not.toContain(here.bedNumber);
  });
});
