'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createUser, DEFAULT_PASSWORD } = require('../helpers/factories');
const { User, Patient } = require('../../src/models');
const profileService = require('../../src/services/profileService');
const { ROLES } = require('../../src/utils/constants');

/**
 * The credential surface.
 *
 * This is the file that would have caught the original app's worst bug: its
 * signup handler passed `req.body.role` into the model, so a stranger could POST
 * `{"role":"admin"}` and own the hospital. The privilege-escalation test below
 * exists so that can never come back, whatever anyone later does to the schema.
 */

const signupPayload = (overrides = {}) => ({
  name: 'Ada Patient',
  email: `ada-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hospital.test`,
  password: DEFAULT_PASSWORD,
  phone: '+15550001111',
  profile: {
    age: 34,
    gender: 'female',
    emergencyContact: { name: 'Kin', relationship: 'sibling', phone: '+15550002222' },
  },
  ...overrides,
});

describe('POST /auth/register', () => {
  it('creates the account, its patient profile and a token pair', async () => {
    const payload = signupPayload();

    const res = await api().post(url('/auth/register')).send(payload);
    const data = expectOk(res, 201);

    expect(data.user).toMatchObject({ email: payload.email, role: ROLES.PATIENT });
    expect(data.accessToken).toEqual(expect.any(String));
    expect(data.refreshToken).toEqual(expect.any(String));

    // The profile is what makes the account usable clinically; a signup that
    // creates only the User leaves a patient who cannot be admitted.
    const profile = await Patient.findOne({ user: data.user.id || data.user._id });
    expect(profile).not.toBeNull();
    expect(profile.medicalRecordNumber).toEqual(expect.any(String));
  });

  it('never returns the password hash', async () => {
    const res = await api().post(url('/auth/register')).send(signupPayload());

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('refuses a self-assigned role, whatever the caller sends', async () => {
    const payload = { ...signupPayload(), role: ROLES.ADMIN };

    const res = await api().post(url('/auth/register')).send(payload);
    const data = expectOk(res, 201);

    expect(data.user.role).toBe(ROLES.PATIENT);
    // Not merely absent from the response — absent from the database.
    const stored = await User.findOne({ email: payload.email });
    expect(stored.role).toBe(ROLES.PATIENT);
  });

  it('rejects a duplicate email with a conflict, not a 500', async () => {
    const payload = signupPayload();
    await api().post(url('/auth/register')).send(payload);

    const res = await api().post(url('/auth/register')).send(payload);

    expectError(res, 409, 'EMAIL_TAKEN');
  });

  it('reports every invalid field at once', async () => {
    const res = await api()
      .post(url('/auth/register'))
      .send({ name: '', email: 'not-an-email', password: 'short' });

    const error = expectError(res, 422, 'VALIDATION_ERROR');
    expect(error.details.length).toBeGreaterThan(1);
  });

  it('leaves no orphan account when the profile write fails', async () => {
    // Registration writes two documents. On standalone MongoDB there is no
    // transaction to roll back, so the service compensates by hand — without
    // that, a half-failed signup leaves an account with no clinical profile and
    // permanently reserves the email address.
    const payload = signupPayload();
    jest
      .spyOn(profileService, 'createProfile')
      .mockRejectedValueOnce(new Error('profile store unavailable'));

    const res = await api().post(url('/auth/register')).send(payload);

    expect(res.status).toBe(500);
    expect(await User.findOne({ email: payload.email })).toBeNull();
  });
});

describe('POST /auth/login', () => {
  it('issues a pair for correct credentials', async () => {
    const { user } = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    const data = expectOk(res);

    expect(data.user.email).toBe(user.email);
    expect(data.accessToken).toEqual(expect.any(String));
  });

  it('answers an unknown email and a wrong password identically', async () => {
    const { user } = await createActor(ROLES.PATIENT);

    const wrongPassword = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: 'NotThePassword1!' });
    const unknownEmail = await api()
      .post(url('/auth/login'))
      .send({ email: 'nobody@hospital.test', password: DEFAULT_PASSWORD });

    // Different answers here turn the endpoint into a user-enumeration oracle:
    // an attacker learns which addresses hold accounts without guessing a
    // single password.
    expectError(wrongPassword, 401, 'INVALID_CREDENTIALS');
    expectError(unknownEmail, 401, 'INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('refuses a deactivated account with its own code', async () => {
    const user = await createUser({ isActive: false });

    const res = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expectError(res, 403, 'ACCOUNT_DISABLED');
  });

  it('matches the email case-insensitively', async () => {
    const user = await createUser();

    const res = await api()
      .post(url('/auth/login'))
      .send({ email: user.email.toUpperCase(), password: DEFAULT_PASSWORD });

    expectOk(res);
  });
});

describe('POST /auth/refresh', () => {
  async function login() {
    const user = await createUser();
    const res = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    return { user, ...expectOk(res) };
  }

  it('exchanges a refresh token for a fresh pair', async () => {
    const { refreshToken } = await login();

    const res = await api().post(url('/auth/refresh')).send({ refreshToken });
    const data = expectOk(res);

    expect(data.accessToken).toEqual(expect.any(String));
    expect(data.refreshToken).toEqual(expect.any(String));
  });

  it('refuses an access token presented as a refresh token', async () => {
    const { accessToken } = await login();

    // The two are signed with different secrets *and* carry a `type` claim, so
    // this fails twice over. One check would be enough; the second means a
    // future refactor that unifies the secrets does not silently open a hole.
    const res = await api().post(url('/auth/refresh')).send({ refreshToken: accessToken });

    expectError(res, 401);
  });

  it('refuses a token minted before a global logout', async () => {
    const { refreshToken, accessToken } = await login();

    // `iat` has one-second resolution, so the staleness check deliberately
    // tolerates a token minted in the same second as the watermark — otherwise
    // the fresh pair handed back by `change-password` would invalidate itself.
    // Stepping past that second is what makes this assertion deterministic
    // rather than a coin flip on sub-second timing.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await api()
      .post(url('/auth/logout-all'))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const res = await api().post(url('/auth/refresh')).send({ refreshToken });

    // `tokensValidFrom` works with Redis down, which is why account-wide
    // revocation moves a watermark instead of enumerating live tokens.
    expectError(res, 401, 'TOKEN_STALE');
  });
});

describe('POST /auth/logout', () => {
  it('accepts a token it can no longer verify rather than erroring', async () => {
    // Logging out with an expired token is a no-op, not a problem the user must
    // resolve before they are allowed to sign in again.
    const res = await api().post(url('/auth/logout')).send({ refreshToken: 'garbage.token.here' });

    expect(expectOk(res)).toEqual({ revoked: false });
  });
});

describe('GET /auth/me', () => {
  it('returns the account with its role profile attached', async () => {
    const { user, headers } = await createActor(ROLES.DOCTOR);

    const res = await api().get(url('/auth/me')).set(headers);
    const data = expectOk(res);

    expect(data.email).toBe(user.email);
    expect(data.profile).toBeTruthy();
    expect(data.profile.specialization).toBe('general_medicine');
  });

  it('rejects a token for a user who has since been deleted', async () => {
    const { user, headers } = await createActor(ROLES.PATIENT);
    await User.deleteOne({ _id: user._id });

    const res = await api().get(url('/auth/me')).set(headers);

    // A signed token stays cryptographically valid after the account is gone;
    // authentication must reload the user, not trust the claims alone.
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and invalidates the old sessions', async () => {
    const { user, headers } = await createActor(ROLES.PATIENT);

    const changed = await api()
      .post(url('/auth/change-password'))
      .set(headers)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'BrandNewPass1!' });
    const tokens = expectOk(changed);

    expect(tokens.accessToken).toEqual(expect.any(String));

    const oldPassword = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    expectError(oldPassword, 401, 'INVALID_CREDENTIALS');

    const newPassword = await api()
      .post(url('/auth/login'))
      .send({ email: user.email, password: 'BrandNewPass1!' });
    expectOk(newPassword);
  });

  it('requires the current password', async () => {
    const { headers } = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/auth/change-password'))
      .set(headers)
      .send({ currentPassword: 'WrongCurrent1!', newPassword: 'BrandNewPass1!' });

    expectError(res, 401, 'INVALID_CREDENTIALS');
  });

  it('refuses a no-op change', async () => {
    const { headers } = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/auth/change-password'))
      .set(headers)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: DEFAULT_PASSWORD });

    expectError(res, 400);
  });
});
