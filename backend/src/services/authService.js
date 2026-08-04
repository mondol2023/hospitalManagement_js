'use strict';

const { userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { ROLES } = require('../utils/constants');
const tokenService = require('./tokenService');
const { TokenService } = require('./tokenService');
const profileService = require('./profileService');

/**
 * Registration, login and the token lifecycle.
 *
 * Deliberate behaviours, each fixing something the previous implementation got
 * wrong:
 *
 *  - **Public registration can only create patients.** The old handler passed
 *    `req.body.role` straight into the model, so anyone could POST
 *    `{"role":"admin"}` and own the hospital. Staff accounts are created by an
 *    admin through `userService`, never here.
 *  - **Login answers identically for an unknown email and a wrong password.**
 *    Distinct messages turn the endpoint into a user-enumeration oracle.
 *  - **Refresh rotates.** The spent token is denylisted as the new pair is
 *    issued, so a stolen refresh token is usable at most once — and if the
 *    attacker uses it first, the legitimate user's next refresh fails loudly
 *    instead of the theft going unnoticed forever.
 */
class AuthService {
  constructor({ users = userRepository, tokens = tokenService, profiles = profileService } = {}) {
    this.users = users;
    this.tokens = tokens;
    this.profiles = profiles;
  }

  /**
   * Public signup. Always creates a `patient` plus its Patient profile.
   *
   * @param {object} input
   * @param {object} [input.profile] patient fields (age, gender, bloodGroup, …)
   */
  async register({ name, email, password, phone, address, profile = {} }) {
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
          { userId: created._id, role: ROLES.PATIENT, profile },
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
    return { user: user.toJSON(), ...this.tokens.issueTokens(user) };
  }

  async login({ email, password }) {
    const user = await this.users.findByEmailWithPassword(email);

    // Compare even when the user is missing? No — bcrypt on a fixed dummy hash
    // would cost the same ~200ms and buy little, since the account-disabled and
    // rate-limit paths already differ. What matters is that both failures below
    // return the *same* message and status.
    if (!user || !(await user.comparePassword(password))) {
      throw ApiError.unauthorized('Invalid email or password', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isActive) {
      throw ApiError.forbidden('This account has been deactivated', {
        code: 'ACCOUNT_DISABLED',
      });
    }

    await this.users.touchLogin(user._id);
    logger.info('User logged in', { userId: String(user._id), role: user.role });

    return { user: user.toJSON(), ...this.tokens.issueTokens(user) };
  }

  /**
   * Exchanges a refresh token for a fresh pair.
   *
   * Every rejection here is a 401 with a distinct `code`, because the client
   * needs to tell "expired, refresh again" from "revoked, send them to login".
   */
  async refresh(refreshToken) {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token is required', { code: 'TOKEN_MISSING' });
    }

    const payload = this.tokens.verifyRefreshToken(refreshToken);

    if (await this.tokens.isRefreshRevoked(payload.jti)) {
      throw ApiError.unauthorized('This session has been revoked', { code: 'TOKEN_REVOKED' });
    }

    const user = await this.users.findActiveById(payload.sub);
    if (!user) {
      throw ApiError.unauthorized('Account is no longer active', { code: 'ACCOUNT_DISABLED' });
    }

    if (TokenService.isStale(payload, user.tokensValidFrom)) {
      throw ApiError.unauthorized('Session expired, please sign in again', {
        code: 'TOKEN_STALE',
      });
    }

    // Burn the presented token before handing out its replacement.
    await this.tokens.revokeRefreshToken(payload);

    // `findActiveById` is projected for the auth middleware, which needs the
    // revocation watermark. The client does not, and it is an internal
    // invalidation timestamp — so it is dropped rather than shipped.
    const { tokensValidFrom, ...safeUser } = user;
    return { user: safeUser, ...this.tokens.issueTokens(user) };
  }

  /**
   * Ends one session. Verification failures are swallowed: logging out with an
   * already-expired token is a no-op, not an error the user should have to
   * resolve before they can sign in again.
   */
  async logout(refreshToken) {
    if (!refreshToken) return { revoked: false };
    try {
      const payload = this.tokens.verifyRefreshToken(refreshToken);
      await this.tokens.revokeRefreshToken(payload);
      return { revoked: true };
    } catch (error) {
      logger.debug('Logout with an unusable refresh token', { error: error.message });
      return { revoked: false };
    }
  }

  /**
   * Ends every session by moving the `tokensValidFrom` watermark. Unlike the
   * denylist this works with Redis down, which is why account-wide revocation
   * uses it rather than enumerating tokens.
   */
  async logoutEverywhere(userId) {
    await this.users.revokeTokens(userId);
    logger.info('All sessions revoked', { userId: String(userId) });
    return { revoked: true };
  }

  /**
   * The `User` pre-save hook re-hashes the password and bumps `tokensValidFrom`,
   * so changing a password logs every other device out as a side effect. The
   * caller gets a fresh pair so *their* session survives.
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
    const user = await this.users.findById(userId);
    if (!user) throw ApiError.notFound('User');
    return this.profiles.withProfile(user);
  }
}

module.exports = new AuthService();
module.exports.AuthService = AuthService;
