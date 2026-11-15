'use strict';

const { userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { ROLES, ROLE_VALUES } = require('../utils/constants');
const profileService = require('./profileService');
const cacheService = require('./cacheService');

const CACHE_PREFIX = 'users';

/** Administrative account management — the counterpart to `authService`. */
class UserService {
  constructor({ users = userRepository, profiles = profileService, cache = cacheService } = {}) {
    this.users = users;
    this.profiles = profiles;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
  }

  /** Creates any account, including staff, together with its profile. */
  async createAccount({ name, email, password, role, phone, address, profile = {} }) {
    if (!ROLE_VALUES.includes(role)) {
      throw ApiError.badRequest(`Unknown role "${role}"`, { code: 'UNKNOWN_ROLE' });
    }
    if (await this.users.emailExists(email)) {
      throw ApiError.conflict('An account with that email already exists', {
        code: 'EMAIL_TAKEN',
      });
    }

    const created = await withTransaction(async (session) => {
      const user = await this.users.create(
        { name, email, password, role, phone, address },
        { session }
      );
      try {
        const profileDoc = await this.profiles.createProfile(
          { userId: user._id, role, profile },
          { session }
        );
        return { user, profile: profileDoc };
      } catch (error) {
        if (!session) {
          await this.users
            .deleteById(user._id)
            .catch((cleanupError) =>
              logger.error('Failed to roll back orphaned account', {
                userId: String(user._id),
                error: cleanupError.message,
              })
            );
        }
        throw error;
      }
    });

    await this.ns.invalidate();
    logger.info('Account created', { userId: String(created.user._id), role });

    return { ...created.user.toJSON(), profile: created.profile.toJSON() };
  }

  /**
   * Staff directory. Cached because it is read on nearly every admin screen and
   * changes rarely; any write in this service drops the whole `users` prefix.
   */
  async list(query = {}) {
    const filter = { ...this.users.searchFilter(query.search) };
    if (query.role) filter.role = query.role;
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;

    const key = this.ns.key('list', {
      role: query.role,
      search: query.search,
      active: query.isActive,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return this.cache.wrap(key, () =>
      this.users.paginate(filter, query, { projection: '-password' })
    );
  }

  async getById(userId) {
    const user = await this.users.findByIdOrThrow(userId, 'User');
    return this.profiles.withProfile(user);
  }

  /** Updates the account's own fields. */
  async update(userId, patch = {}) {
    const allowed = ['name', 'phone', 'address', 'profilePic'];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const user = await this.users.updateById(userId, { $set: update });
    if (!user) throw ApiError.notFound('User');

    await this.ns.invalidate();
    return user;
  }

  /**
   * Moves an account to a different role, creating the new profile and retiring
   * the old one in the same unit of work.
   */
  async changeRole(userId, nextRole, profile = {}) {
    if (!ROLE_VALUES.includes(nextRole)) {
      throw ApiError.badRequest(`Unknown role "${nextRole}"`, { code: 'UNKNOWN_ROLE' });
    }

    const current = await this.users.findByIdOrThrow(userId, 'User');
    if (current.role === nextRole) return current;

    const updated = await withTransaction(async (session) => {
      const existing = await this.profiles.findByUser(userId, nextRole);
      if (!existing) {
        await this.profiles.createProfile({ userId, role: nextRole, profile }, { session });
      }
      // The previous profile is dropped rather than kept: a stale Doctor row
      // would keep the user in specialist searches after they stop practising.
      if (current.role !== ROLES.PATIENT) {
        await this.profiles.deleteForUser(userId, current.role, { session });
      }
      return this.users.updateById(userId, { $set: { role: nextRole } }, { session });
    });

    // Their current tokens still carry the old role claim, so end the sessions.
    await this.users.revokeTokens(userId);
    await this.ns.invalidate();
    logger.info('Role changed', { userId: String(userId), from: current.role, to: nextRole });

    return updated;
  }

  /** Soft delete. Records are never removed — clinical history must survive staff turnover. */
  async setActive(userId, isActive) {
    const user = await this.users.updateById(userId, { $set: { isActive } });
    if (!user) throw ApiError.notFound('User');

    if (!isActive) await this.users.revokeTokens(userId);
    await this.profiles
      .repositoryFor(user.role)
      .updateOne({ user: userId }, { $set: { isActive } })
      .catch((error) => logger.warn('Could not sync profile active flag', { error: error.message }));

    await this.ns.invalidate();
    logger.info('Account activation changed', { userId: String(userId), isActive });
    return user;
  }

  /** Headcount by role, for the admin dashboard. */
  async statistics() {
    const key = this.ns.key('stats');
    return this.cache.wrap(key, async () => {
      const rows = await this.users.countByRole();
      const byRole = Object.fromEntries(ROLE_VALUES.map((role) => [role, 0]));
      let total = 0;
      for (const row of rows) {
        byRole[row._id] = row.count;
        total += row.count;
      }
      return { total, byRole };
    }, 300);
  }
}

module.exports = new UserService();
module.exports.UserService = UserService;
