'use strict';

const { userRepository, branchRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { ROLES, ROLE_VALUES, STAFF_ROLES, TENANT_ADMIN_ASSIGNABLE_ROLES } = require('../utils/constants');
const profileService = require('./profileService');
const cacheService = require('./cacheService');

const CACHE_PREFIX = 'users';

/** Fields of the shared `Staff` profile a role change may overwrite. `employeeId` is deliberately absent. */
const STAFF_PROFILE_FIELDS = Object.freeze([
  'designation',
  'employmentType',
  'reportsTo',
  'salaryCents',
  'notes',
  'department',
  'shift',
]);

/**
 * Checks 1 and 2 of the access-change guard. Both depend only on who is asking
 * and who is affected, so they run before anything is read or written.
 *
 * `actor` is required: a caller that cannot say who it is acting for must not be
 * able to skip the guard by leaving the argument out.
 */
function assertActorMayChangeAccess(actor, userId, { touchesAdmin }) {
  if (!actor) throw ApiError.forbidden('Acting user is required', { code: 'ACTOR_REQUIRED' });

  // Checked first, so a manager promoting themselves is a self-lockout rather
  // than a missing-privilege error that suggests asking someone else would work.
  if (String(userId) === String(actor.id)) {
    throw ApiError.forbidden(
      "You can't change your own role or deactivate your own account. Ask another administrator.",
      { code: 'SELF_LOCKOUT' }
    );
  }

  // Managers pass `requireAdmin`, but the admin role itself stays with admins.
  if (touchesAdmin && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden("Only an administrator can change another administrator's access.", {
      code: 'ADMIN_GRANT_REQUIRED',
    });
  }
}

/** Check 3: refuses a write that would leave the hospital with no active administrator. */
async function assertAnotherAdminRemains(users, { session } = {}) {
  const activeAdmins = await users.countActive({ role: ROLES.ADMIN }, { session });
  if (activeAdmins <= 1) {
    throw ApiError.conflict(
      'This is the last active administrator. Make someone else an administrator first.',
      { code: 'LAST_ADMIN' }
    );
  }
}

/** Administrative account management — the counterpart to `authService`. */
class UserService {
  constructor({
    users = userRepository,
    profiles = profileService,
    cache = cacheService,
    branches = branchRepository,
  } = {}) {
    this.branches = branches;
    this.users = users;
    this.profiles = profiles;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
  }

  /** Creates any account, including staff, together with its profile. */
  async createAccount({ name, email, password, role, phone, address, profile = {} }) {
    if (!TENANT_ADMIN_ASSIGNABLE_ROLES.includes(role)) {
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
  async changeRole(userId, nextRole, profile = {}, actor) {
    if (!TENANT_ADMIN_ASSIGNABLE_ROLES.includes(nextRole)) {
      throw ApiError.badRequest(`Unknown role "${nextRole}"`, { code: 'UNKNOWN_ROLE' });
    }

    const current = await this.users.findByIdOrThrow(userId, 'User');
    // Runs even for a no-op, so the API never confirms the shape of a request it
    // would refuse from this caller.
    assertActorMayChangeAccess(actor, userId, {
      touchesAdmin: current.role === ROLES.ADMIN || nextRole === ROLES.ADMIN,
    });
    if (current.role === nextRole) return current;

    const removesActiveAdmin = current.role === ROLES.ADMIN && current.isActive !== false;
    const sameModel = this.profiles.modelFor(current.role) === this.profiles.modelFor(nextRole);

    const updated = await withTransaction(async (session) => {
      // Counted inside the transaction that writes, where the deployment has one.
      // On a standalone dev database two admins demoting each other in the same
      // instant could both pass; that race is accepted.
      if (removesActiveAdmin) await assertAnotherAdminRemains(this.users, { session });

      if (sameModel) {
        // Staff → staff: both roles live in one row, so update it in place.
        // Creating the "new" profile and deleting the "old" one would find and
        // then delete the same row. The person keeps their `employeeId`, so an
        // id minted as `REC-…` stays `REC-…` after a move to pharmacist.
        const patch = { role: nextRole };
        for (const field of STAFF_PROFILE_FIELDS) {
          if (profile[field] !== undefined) patch[field] = profile[field];
        }
        const kept = await this.profiles
          .repositoryFor(nextRole)
          .updateOne({ user: userId }, { $set: patch }, { session });
        // No row means the account was damaged by the old behaviour; rebuild it.
        if (!kept) {
          await this.profiles.createProfile({ userId, role: nextRole, profile }, { session });
        }
      } else {
        const existing = await this.profiles.findByUser(userId, nextRole);
        if (!existing) {
          await this.profiles.createProfile({ userId, role: nextRole, profile }, { session });
        }
        // The previous profile is dropped rather than kept: a stale Doctor row
        // would keep the user in specialist searches after they stop practising.
        if (current.role !== ROLES.PATIENT) {
          await this.profiles.deleteForUser(userId, current.role, { session });
        }
      }
      return this.users.updateById(userId, { $set: { role: nextRole } }, { session });
    });

    // Their current tokens still carry the old role claim, so end the sessions.
    await this.users.revokeTokens(userId);
    await this.ns.invalidate();
    logger.info('Role changed', { userId: String(userId), from: current.role, to: nextRole });

    return updated;
  }

  /** Replaces a staff member's branch membership. */
  async setBranches(userId, branchIds) {
    const user = await this.users.findByIdOrThrow(userId, 'User');
    if (!STAFF_ROLES.includes(user.role)) {
      throw ApiError.badRequest('Only staff accounts have branch membership');
    }
    if (!branchIds.length) {
      throw ApiError.badRequest('Staff need at least one branch', { code: 'BRANCH_REQUIRED' });
    }
    // Scoped count: ids from another organisation do not match.
    if ((await this.branches.countByIds(branchIds)) !== branchIds.length) {
      throw ApiError.notFound('Branch');
    }

    const members = branchIds.map(String);
    const keep = (id) => (id && members.includes(String(id)) ? id : undefined);
    const set = {
      branches: branchIds,
      defaultBranch: keep(user.defaultBranch) ?? branchIds[0],
      lastActiveBranch: keep(user.lastActiveBranch) ?? null,
    };
    const updated = await this.users.updateById(userId, { $set: set });

    await this.ns.invalidate();
    logger.info('Branch membership changed', { userId: String(userId), count: branchIds.length });
    return updated;
  }

  /** Soft delete. Records are never removed — clinical history must survive staff turnover. */
  async setActive(userId, isActive, actor) {
    const target = await this.users.findByIdOrThrow(userId, 'User');
    assertActorMayChangeAccess(actor, userId, { touchesAdmin: target.role === ROLES.ADMIN });

    const removesActiveAdmin =
      target.role === ROLES.ADMIN && target.isActive !== false && !isActive;

    const user = await withTransaction(async (session) => {
      if (removesActiveAdmin) await assertAnotherAdminRemains(this.users, { session });
      return this.users.updateById(userId, { $set: { isActive } }, { session });
    });
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
