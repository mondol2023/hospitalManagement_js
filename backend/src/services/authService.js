'use strict';

const { userRepository, branchRepository } = require('../repositories');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { ROLES, ORGANIZATION_STATUS } = require('../utils/constants');
const tokenService = require('./tokenService');
const { TokenService } = require('./tokenService');
const profileService = require('./profileService');
const organizationStatus = require('./organizationStatus');
const context = require('../utils/context');
const organizationResolver = require('./organizationResolver');

// Computed once, at the same cost as real hashes, for the timing-equalising compare.
let dummyHash;
const getDummyHash = () => (dummyHash ||= bcrypt.hash('timing-equaliser', env.BCRYPT_ROUNDS));

/** Registration, login and the token lifecycle. */
class AuthService {
  constructor({
    users = userRepository,
    tokens = tokenService,
    profiles = profileService,
    resolver = organizationResolver,
    orgs = organizationStatus,
    branches = branchRepository,
  } = {}) {
    this.branches = branches;
    this.resolver = resolver;
    this.orgs = orgs;
    this.users = users;
    this.tokens = tokens;
    this.profiles = profiles;
  }

  /** Public signup. Always creates a `patient` plus its Patient profile. */
  async register({ name, email, password, phone, address, profile = {}, organizationCode, host }) {
    const resolved = await this.resolver.resolve({ organizationCode, host }, { allowEmailLookup: false });
    if (!resolved?.organizationId) {
      throw ApiError.badRequest('Organization is required', { code: 'ORGANIZATION_REQUIRED' });
    }
    const { organizationId } = resolved;
    const info = await this._activeInfo(organizationId);
    const branchId = info.defaultRegistrationBranch;

    return context.runAs({ organizationId, branchId, source: 'http' }, () =>
      this._register({ name, email, password, phone, address, profile }, branchId)
    );
  }

  async _activeInfo(organizationId) {
    const info = await this.orgs.getInfo(organizationId);
    if (!info) throw ApiError.internal('Organization record is missing');
    if (info.status === ORGANIZATION_STATUS.SUSPENDED) {
      throw ApiError.forbidden('This organization is suspended', { code: 'ORGANIZATION_SUSPENDED' });
    }
    return info;
  }

  async _register({ name, email, password, phone, address, profile }, branchId) {
    if (await this.users.emailExists(email)) {
      throw ApiError.conflict('An account with that email already exists', {
        code: 'EMAIL_TAKEN',
      });
    }

    const user = await withTransaction(async (session) => {
      const created = await this.users.create(
        { name, email, password, phone, address, role: ROLES.PATIENT },
        { session }
      );

      try {
        await this.profiles.createProfile(
          { userId: created._id, role: ROLES.PATIENT, profile: { ...profile, registeredAtBranch: branchId } },
          { session }
        );
      } catch (error) {
        // With a session the transaction rolls this back for us. Without one
        // (standalone MongoDB) we must compensate by hand, or a failed signup
        // leaves an orphan account that permanently blocks the email address.
        if (!session) {
          await this.users
            .deleteById(created._id)
            .catch((cleanupError) =>
              logger.error('Failed to roll back orphaned user after signup error', {
                userId: String(created._id),
                error: cleanupError.message,
              })
            );
        }
        throw error;
      }

      return created;
    });

    logger.info('Patient registered', { userId: String(user._id) });
    return { user: user.toJSON(), ...this.tokens.issueTokens(user, { branchId }) };
  }

  async login({ email, password, organizationCode, host }) {
    const resolved = await this.resolver.resolve({ organizationCode, host, email });

    let user = null;
    let found = null;
    if (resolved?.organizationId) {
      found = await this._findIn(resolved.organizationId, email);
      if (found.user && (await found.user.comparePassword(password))) user = found.user;
    } else if (resolved?.candidates) {
      const matches = [];
      for (const id of resolved.candidates.slice(0, 5)) {
        const hit = await this._findIn(id, email);
        if (hit.user && (await hit.user.comparePassword(password))) matches.push(hit);
      }
      if (matches.length > 1) {
        throw ApiError.conflict('Specify your organization code', { code: 'ORGANIZATION_REQUIRED' });
      }
      found = matches[0] || null;
      user = found?.user || null;
    } else {
      // No organisation: only a platform admin can log in without one.
      const admin = await this.resolver.findPlatformAdmin(email);
      if (admin && (await admin.comparePassword(password))) user = admin;
    }

    if (!user) {
      // Burn comparable bcrypt time so a missing account is not faster than a wrong password.
      if (!found?.user) await bcrypt.compare(password, await getDummyHash());
      throw ApiError.unauthorized('Invalid email or password', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isActive) {
      throw ApiError.forbidden('This account has been deactivated', {
        code: 'ACCOUNT_DISABLED',
      });
    }

    const organizationId = found?.organizationId ?? null;
    const info = organizationId ? await this._activeInfo(organizationId) : null;
    const touch = () => this.users.touchLogin(user._id);
    if (organizationId) await context.runAs({ organizationId, source: 'http' }, touch);
    else await this.resolver.touchPlatformAdminLogin(user._id);
    logger.info('User logged in', { userId: String(user._id), role: user.role });

    const branchId =
      user.role === ROLES.PATIENT
        ? info?.defaultRegistrationBranch
        : user.lastActiveBranch ?? user.defaultBranch;
    return { user: user.toJSON(), ...this.tokens.issueTokens(user, { branchId }) };
  }

  /** Looks the user up inside one organisation. */
  async _findIn(organizationId, email) {
    const user = await context.runAs({ organizationId, source: 'http' }, () =>
      this.users.findByEmailWithPassword(email)
    );
    return { user, organizationId };
  }

  /** Exchanges a refresh token for a fresh pair. */
  async refresh(refreshToken) {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token is required', { code: 'TOKEN_MISSING' });
    }

    const payload = this.tokens.verifyRefreshToken(refreshToken);

    const user = await this._loadForRefresh(payload);
    if (!user) {
      throw ApiError.unauthorized('Account is no longer active', { code: 'ACCOUNT_DISABLED' });
    }

    if (TokenService.isStale(payload, user.tokensValidFrom)) {
      throw ApiError.unauthorized('Session expired, please sign in again', {
        code: 'TOKEN_STALE',
      });
    }

    // Atomic spend before issuing: a concurrent replay of the same token loses.
    await this.tokens.consumeRefreshToken(payload);

    // `findActiveById` is projected for the auth middleware, which needs the
    // revocation watermark. The client does not, and it is an internal
    // invalidation timestamp — so it is dropped rather than shipped.
    const { tokensValidFrom, ...safeUser } = user;
    return { user: safeUser, ...this.tokens.issueTokens(user, { branchId: this._refreshBranch(payload, user) }) };
  }

  /** Tokens without an org claim are only valid for platform admins. */
  async _loadForRefresh(payload) {
    if (payload.org) {
      return context.runAs({ organizationId: payload.org, source: 'http' }, () =>
        this.users.findActiveById(payload.sub)
      );
    }
    const user = await this.resolver.loadUserForRefresh(payload.sub);
    if (user && user.role !== ROLES.PLATFORM_ADMIN) {
      throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID' });
    }
    return user;
  }

  /** Keeps the token's branch while the user still belongs to it. */
  _refreshBranch(payload, user) {
    const member = (user.branches || []).map(String).includes(String(payload.br));
    return member ? payload.br : undefined;
  }

  /**
   * Moves the session to another branch the user belongs to. Spends the presented
   * refresh token, so the old branch's token pair cannot be replayed.
   */
  async switchBranch(userId, { branchId, refreshToken }) {
    const payload = this.tokens.verifyRefreshToken(refreshToken);
    if (String(payload.sub) !== String(userId)) {
      throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID' });
    }

    // Tenant-scoped: a branch of another organisation is simply "not found".
    const branch = await this.branches.findById(branchId);
    if (!branch) throw ApiError.notFound('Branch');

    const user = await this.users.findActiveById(userId);
    if (!user) throw ApiError.unauthorized('Account is no longer active', { code: 'ACCOUNT_DISABLED' });
    if (TokenService.isStale(payload, user.tokensValidFrom)) {
      throw ApiError.unauthorized('Session expired, please sign in again', { code: 'TOKEN_STALE' });
    }

    if (!(user.branches || []).map(String).includes(String(branch._id))) {
      throw ApiError.forbidden('You do not belong to this branch', { code: 'BRANCH_ACCESS_REVOKED' });
    }
    if (!branch.isActive) {
      throw ApiError.forbidden('This branch is not active', { code: 'BRANCH_INACTIVE' });
    }

    await this.tokens.consumeRefreshToken(payload);
    await this.users.updateById(userId, { $set: { lastActiveBranch: branch._id } });

    const { tokensValidFrom, ...safeUser } = user;
    safeUser.lastActiveBranch = branch._id;
    return { user: safeUser, ...this.tokens.issueTokens(user, { branchId: branch._id }) };
  }

  /** Ends one session. */
  async logout(refreshToken) {
    if (!refreshToken) return { revoked: false };
    try {
      const payload = this.tokens.verifyRefreshToken(refreshToken);
      // False when Redis is off: report it rather than claim a revocation.
      return { revoked: Boolean(await this.tokens.revokeRefreshToken(payload)) };
    } catch (error) {
      logger.debug('Logout with an unusable refresh token', { error: error.message });
      return { revoked: false };
    }
  }

  /** Ends every session by moving the `tokensValidFrom` watermark. */
  async logoutEverywhere(userId) {
    await this.users.revokeTokens(userId);
    logger.info('All sessions revoked', { userId: String(userId) });
    return { revoked: true };
  }

  /**
   * The `User` pre-save hook re-hashes the password and bumps `tokensValidFrom`, so changing a
   * password logs every other device out as a side effect.
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user) throw ApiError.notFound('User');

    if (!(await user.comparePassword(currentPassword))) {
      throw ApiError.unauthorized('Current password is incorrect', {
        code: 'INVALID_CREDENTIALS',
      });
    }
    if (currentPassword === newPassword) {
      throw ApiError.badRequest('The new password must differ from the current one');
    }

    user.password = newPassword;
    await user.save();

    logger.info('Password changed', { userId: String(userId) });
    return this.tokens.issueTokens(user);
  }

  /** Current user plus their role-specific profile, for `GET /auth/me`. */
  async me(userId) {
    const user = await this.users.findByIdOrThrow(userId, 'User');
    return this.profiles.withProfile(user);
  }
}

module.exports = new AuthService();
module.exports.AuthService = AuthService;
