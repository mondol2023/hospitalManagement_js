'use strict';

jest.mock('../../src/utils/transaction', () => ({
  withTransaction: jest.fn(),
}));

const { withTransaction } = require('../../src/utils/transaction');
const { AuthService } = require('../../src/services/authService');
const ApiError = require('../../src/utils/ApiError');
const BaseRepository = require('../../src/repositories/BaseRepository');
const { ROLES } = require('../../src/utils/constants');

/**
 * The authentication service, tested through its constructor seam.
 *
 * The integration suite drives these same methods over HTTP and proves the happy
 * paths. What it cannot reach is everything this file is about, because each of
 * those behaviours needs a *failure injected below the service*:
 *
 *  - the compensating delete that runs when profile creation fails on a
 *    standalone MongoDB, which needs `profiles.createProfile` to throw;
 *  - the same path when the compensation *itself* fails, which needs two
 *    injected failures at once;
 *  - the difference between the session and no-session branches, which over HTTP
 *    depends on whether the test database happens to be a replica set;
 *  - the ordering guarantee in `refresh` — the old token is burned *before* the
 *    replacement is issued — which is invisible in a response body.
 *
 * `withTransaction` is mocked rather than left real: the real one probes the
 * connection, and a unit test that behaves differently depending on whether a
 * database happens to be listening is not a unit test. The two branches it can
 * hand back are exercised explicitly instead.
 */

const nowSeconds = () => Math.floor(Date.now() / 1000);

const fakeUser = (overrides = {}) => {
  const password = overrides.password || 'Correct-Horse-1';
  const user = {
    _id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: ROLES.PATIENT,
    isActive: true,
    tokensValidFrom: null,
    comparePassword: jest.fn(async (candidate) => candidate === password),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
    password,
  };
  // Stands in for the schema's `toJSON` transform, whose job is to drop the
  // hash. Asserting the service calls it is asserting the hash cannot ride out.
  user.toJSON = jest.fn(() => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  }));
  return user;
};

const fakeUsers = () => ({
  emailExists: jest.fn().mockResolvedValue(false),
  create: jest.fn(),
  deleteById: jest.fn().mockResolvedValue(true),
  findByEmailWithPassword: jest.fn(),
  findByIdWithPassword: jest.fn(),
  findActiveById: jest.fn(),
  findById: jest.fn(),
  findByIdOrThrow: BaseRepository.prototype.findByIdOrThrow,
  touchLogin: jest.fn().mockResolvedValue(undefined),
  revokeTokens: jest.fn().mockResolvedValue(undefined),
});

const fakeTokens = () => ({
  issueTokens: jest.fn(() => ({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    tokenType: 'Bearer',
    expiresIn: '15m',
  })),
  verifyRefreshToken: jest.fn(() => ({
    sub: 'user-1',
    jti: 'jti-1',
    type: 'refresh',
    iat: nowSeconds(),
  })),
  consumeRefreshToken: jest.fn().mockResolvedValue(undefined),
  revokeRefreshToken: jest.fn().mockResolvedValue(true),
});

const fakeProfiles = () => ({
  createProfile: jest.fn().mockResolvedValue({ id: 'patient-1' }),
  withProfile: jest.fn(async (user) => ({ ...user, profile: { id: 'patient-1' } })),
});

let users;
let tokens;
let profiles;
let service;

beforeEach(() => {
  users = fakeUsers();
  tokens = fakeTokens();
  profiles = fakeProfiles();
  service = new AuthService({ users, tokens, profiles });
  // Standalone MongoDB — no session. The replica-set branch opts in per test.
  withTransaction.mockImplementation((fn) => fn(null));
});

/** Asserts an ApiError rather than whatever a mock happened to throw. */
const expectApiError = async (promise, { status, code }) => {
  await expect(promise).rejects.toMatchObject({
    name: 'ApiError',
    statusCode: status,
    code,
    isOperational: true,
  });
};

describe('register', () => {
  const input = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Correct-Horse-1',
    phone: '+15550100',
    profile: { bloodGroup: 'O+' },
  };

  it('creates a patient and hands back a session', async () => {
    const created = fakeUser();
    users.create.mockResolvedValue(created);

    const result = await service.register(input);

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', role: ROLES.PATIENT }),
      { session: null }
    );
    expect(profiles.createProfile).toHaveBeenCalledWith(
      { userId: 'user-1', role: ROLES.PATIENT, profile: { bloodGroup: 'O+' } },
      { session: null }
    );
    expect(result).toEqual({
      user: created.toJSON(),
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      expiresIn: '15m',
    });
  });

  it('forces the patient role even when the caller asks for admin', async () => {
    // The original handler passed `req.body.role` into the model, so a public
    // signup could mint an administrator. This is that regression, pinned at the
    // layer that decides it rather than at the validator that also strips it —
    // two independent defences, and this is the one that survives a schema edit.
    users.create.mockResolvedValue(fakeUser());

    await service.register({ ...input, role: ROLES.ADMIN, isActive: false });

    const [payload] = users.create.mock.calls[0];
    expect(payload.role).toBe(ROLES.PATIENT);
    expect(payload).not.toHaveProperty('isActive');
  });

  it('returns the transformed user, never the raw document', async () => {
    // `toJSON` is what removes the password hash. Returning `created` directly
    // would put it in the response body of every successful signup.
    const created = fakeUser();
    users.create.mockResolvedValue(created);

    const { user } = await service.register(input);

    expect(created.toJSON).toHaveBeenCalled();
    expect(user).not.toHaveProperty('password');
  });

  it('refuses a taken email without touching the database', async () => {
    users.emailExists.mockResolvedValue(true);

    await expectApiError(service.register(input), { status: 409, code: 'EMAIL_TAKEN' });
    expect(users.create).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('deletes the orphaned user when the profile fails and there is no session', async () => {
    // Standalone MongoDB cannot roll back, so a half-finished signup would leave
    // an account with no patient record — and because the email is unique, the
    // person could never retry. They would be locked out by our failure.
    const created = fakeUser();
    users.create.mockResolvedValue(created);
    profiles.createProfile.mockRejectedValue(new Error('profile validation failed'));

    await expect(service.register(input)).rejects.toThrow('profile validation failed');
    expect(users.deleteById).toHaveBeenCalledWith('user-1');
  });

  it('still reports the original failure when the cleanup also fails', async () => {
    // Two things are wrong at once; the caller must hear about the first. A
    // cleanup error surfacing instead would send everyone debugging the wrong
    // half of the problem.
    users.create.mockResolvedValue(fakeUser());
    profiles.createProfile.mockRejectedValue(new Error('profile validation failed'));
    users.deleteById.mockRejectedValue(new Error('connection reset'));

    await expect(service.register(input)).rejects.toThrow('profile validation failed');
  });

  it('leaves cleanup to the transaction when there is a session', async () => {
    // Compensating by hand inside an open transaction would issue a delete that
    // the rollback then also undoes — at best redundant, at worst confusing in
    // the logs.
    const session = { id: 'session-1' };
    withTransaction.mockImplementation((fn) => fn(session));
    users.create.mockResolvedValue(fakeUser());
    profiles.createProfile.mockRejectedValue(new Error('profile validation failed'));

    await expect(service.register(input)).rejects.toThrow('profile validation failed');
    expect(users.deleteById).not.toHaveBeenCalled();
    expect(users.create).toHaveBeenCalledWith(expect.any(Object), { session });
  });

  it('does not issue tokens for a signup that failed', async () => {
    users.create.mockResolvedValue(fakeUser());
    profiles.createProfile.mockRejectedValue(new Error('profile validation failed'));

    await expect(service.register(input)).rejects.toThrow();
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  const credentials = { email: 'ada@example.com', password: 'Correct-Horse-1' };

  it('returns the user and a fresh pair, and records the login', async () => {
    const user = fakeUser();
    users.findByEmailWithPassword.mockResolvedValue(user);

    const result = await service.login(credentials);

    expect(users.touchLogin).toHaveBeenCalledWith('user-1');
    expect(result.accessToken).toBe('access-1');
    expect(result.user).not.toHaveProperty('password');
  });

  it('answers an unknown email and a wrong password identically', async () => {
    // Any difference — status, code, message, even ordering — turns this
    // endpoint into an oracle for "does this person bank here", which for a
    // hospital is "is this person a patient here".
    users.findByEmailWithPassword.mockResolvedValue(null);
    const unknown = await service.login(credentials).catch((error) => error);

    users.findByEmailWithPassword.mockResolvedValue(fakeUser());
    const wrong = await service.login({ ...credentials, password: 'wrong' }).catch((error) => error);

    expect(unknown).toBeInstanceOf(ApiError);
    expect(wrong).toBeInstanceOf(ApiError);
    expect(wrong.statusCode).toBe(unknown.statusCode);
    expect(wrong.code).toBe(unknown.code);
    expect(wrong.message).toBe(unknown.message);
    expect(unknown.code).toBe('INVALID_CREDENTIALS');
  });

  it('reveals a deactivated account only after the password checks out', async () => {
    // Otherwise `ACCOUNT_DISABLED` on a bad password would confirm the account
    // exists to someone who cannot prove they own it.
    users.findByEmailWithPassword.mockResolvedValue(fakeUser({ isActive: false }));

    await expectApiError(service.login({ ...credentials, password: 'wrong' }), {
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    await expectApiError(service.login(credentials), {
      status: 403,
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('issues nothing and records nothing when login fails', async () => {
    users.findByEmailWithPassword.mockResolvedValue(fakeUser({ isActive: false }));

    await expect(service.login(credentials)).rejects.toThrow();
    expect(tokens.issueTokens).not.toHaveBeenCalled();
    expect(users.touchLogin).not.toHaveBeenCalled();
  });
});

describe('refresh', () => {
  it('rotates: burns the presented token, then issues the replacement', async () => {
    // Order is the whole guarantee. Issuing first and revoking second leaves a
    // window where a crash in between hands out a new pair while the old one
    // stays valid — which is the theft scenario rotation exists to close.
    users.findActiveById.mockResolvedValue({ _id: 'user-1', role: ROLES.PATIENT });

    const result = await service.refresh('refresh-token');

    expect(tokens.consumeRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'jti-1' })
    );
    expect(tokens.consumeRefreshToken.mock.invocationCallOrder[0]).toBeLessThan(
      tokens.issueTokens.mock.invocationCallOrder[0]
    );
    expect(result.refreshToken).toBe('refresh-1');
  });

  it('does not return the revocation watermark to the client', async () => {
    // `findActiveById` is projected for the auth middleware, which needs
    // `tokensValidFrom`. Shipping it would publish exactly when every session
    // was invalidated, for no client benefit.
    users.findActiveById.mockResolvedValue({
      _id: 'user-1',
      role: ROLES.PATIENT,
      tokensValidFrom: new Date('2026-01-01T00:00:00Z'),
    });

    const { user } = await service.refresh('refresh-token');

    expect(user).not.toHaveProperty('tokensValidFrom');
    expect(user._id).toBe('user-1');
  });

  it('rejects a missing token before doing any work', async () => {
    for (const missing of [undefined, null, '']) {
      await expectApiError(service.refresh(missing), { status: 401, code: 'TOKEN_MISSING' });
    }
    expect(tokens.verifyRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects a replayed token that rotation already burned', async () => {
    users.findActiveById.mockResolvedValue({ _id: 'user-1', role: ROLES.PATIENT });
    tokens.consumeRefreshToken.mockRejectedValue(
      ApiError.unauthorized('revoked', { code: 'TOKEN_REVOKED' })
    );

    await expectApiError(service.refresh('refresh-token'), {
      status: 401,
      code: 'TOKEN_REVOKED',
    });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose account has since been deactivated', async () => {
    // A fired employee's refresh token is otherwise good for its full seven
    // days. `findActiveById` filters on `isActive`, so a deactivated account
    // reads as missing here.
    users.findActiveById.mockResolvedValue(null);

    await expectApiError(service.refresh('refresh-token'), {
      status: 401,
      code: 'ACCOUNT_DISABLED',
    });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('rejects a token minted before a logout-everywhere', async () => {
    tokens.verifyRefreshToken.mockReturnValue({
      sub: 'user-1',
      jti: 'jti-1',
      iat: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000),
    });
    users.findActiveById.mockResolvedValue({
      _id: 'user-1',
      role: ROLES.PATIENT,
      tokensValidFrom: new Date('2026-01-02T00:00:00Z'),
    });

    await expectApiError(service.refresh('refresh-token'), {
      status: 401,
      code: 'TOKEN_STALE',
    });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('lets a verification failure through with its own code intact', async () => {
    // `TOKEN_EXPIRED` tells the client to sign in again; flattening it into a
    // generic 401 here would lose the distinction the client branches on.
    tokens.verifyRefreshToken.mockImplementation(() => {
      throw ApiError.unauthorized('Token expired', { code: 'TOKEN_EXPIRED' });
    });

    await expectApiError(service.refresh('expired'), { status: 401, code: 'TOKEN_EXPIRED' });
    expect(tokens.consumeRefreshToken).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('burns the presented token', async () => {
    await expect(service.logout('refresh-token')).resolves.toEqual({ revoked: true });
    expect(tokens.revokeRefreshToken).toHaveBeenCalled();
  });

  it('reports revoked: false when the denylist could not record it', async () => {
    tokens.revokeRefreshToken.mockResolvedValue(false);
    await expect(service.logout('refresh-token')).resolves.toEqual({ revoked: false });
  });

  it('treats a missing token as an accomplished logout', async () => {
    await expect(service.logout(undefined)).resolves.toEqual({ revoked: false });
    expect(tokens.verifyRefreshToken).not.toHaveBeenCalled();
  });

  it('never fails on an unusable token', async () => {
    // Signing out with an expired token is the normal end of a long session.
    // Answering 401 would leave the client unable to clear its state without
    // first refreshing a token it is trying to discard.
    tokens.verifyRefreshToken.mockImplementation(() => {
      throw ApiError.unauthorized('Token expired', { code: 'TOKEN_EXPIRED' });
    });

    await expect(service.logout('expired')).resolves.toEqual({ revoked: false });
  });

  it('never fails when the denylist is unreachable', async () => {
    tokens.revokeRefreshToken.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.logout('refresh-token')).resolves.toEqual({ revoked: false });
  });
});

describe('logoutEverywhere', () => {
  it('moves the watermark rather than enumerating tokens', async () => {
    // The denylist cannot answer "every token for this user" and would be wrong
    // the moment Redis restarted. The watermark lives in Mongo and holds.
    await expect(service.logoutEverywhere('user-1')).resolves.toEqual({ revoked: true });
    expect(users.revokeTokens).toHaveBeenCalledWith('user-1');
  });
});

describe('changePassword', () => {
  const change = { currentPassword: 'Correct-Horse-1', newPassword: 'Battery-Staple-2' };

  it('saves the new password and returns a pair that keeps this session alive', async () => {
    // The pre-save hook bumps `tokensValidFrom`, which invalidates every token
    // the user holds — including the one they are using right now. Handing back
    // a fresh pair is what stops a password change from logging you out of the
    // page you changed it on.
    const user = fakeUser();
    users.findByIdWithPassword.mockResolvedValue(user);

    const result = await service.changePassword('user-1', change);

    expect(user.password).toBe('Battery-Staple-2');
    expect(user.save).toHaveBeenCalled();
    expect(result.accessToken).toBe('access-1');
    expect(user.save.mock.invocationCallOrder[0]).toBeLessThan(
      tokens.issueTokens.mock.invocationCallOrder[0]
    );
  });

  it('assigns the plaintext and lets the model hash it', async () => {
    // Hashing here as well would double-hash and lock the user out of their own
    // account, with nothing failing until their next login.
    const user = fakeUser();
    users.findByIdWithPassword.mockResolvedValue(user);

    await service.changePassword('user-1', change);

    expect(user.password).toBe('Battery-Staple-2');
    expect(user.password).not.toMatch(/^\$2[aby]\$/);
  });

  it('refuses a wrong current password without saving', async () => {
    const user = fakeUser();
    users.findByIdWithPassword.mockResolvedValue(user);

    await expectApiError(
      service.changePassword('user-1', { ...change, currentPassword: 'wrong' }),
      { status: 401, code: 'INVALID_CREDENTIALS' }
    );
    expect(user.save).not.toHaveBeenCalled();
  });

  it('refuses a new password identical to the current one', async () => {
    // It would otherwise "succeed" while invalidating every other session — a
    // confusing way to log yourself out of your other devices for nothing.
    const user = fakeUser();
    users.findByIdWithPassword.mockResolvedValue(user);

    await expectApiError(
      service.changePassword('user-1', { currentPassword: change.currentPassword, newPassword: change.currentPassword }),
      { status: 400, code: 'BAD_REQUEST' }
    );
    expect(user.save).not.toHaveBeenCalled();
  });

  it('404s for a user that no longer exists', async () => {
    users.findByIdWithPassword.mockResolvedValue(null);

    await expectApiError(service.changePassword('gone', change), {
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('me', () => {
  it('returns the user joined with their role-specific profile', async () => {
    const user = fakeUser({ role: ROLES.DOCTOR });
    users.findById.mockResolvedValue(user);

    const result = await service.me('user-1');

    expect(profiles.withProfile).toHaveBeenCalledWith(user);
    expect(result.profile).toEqual({ id: 'patient-1' });
  });

  it('404s rather than returning a profile-less null', async () => {
    users.findById.mockResolvedValue(null);

    await expectApiError(service.me('gone'), { status: 404, code: 'NOT_FOUND' });
    expect(profiles.withProfile).not.toHaveBeenCalled();
  });
});
