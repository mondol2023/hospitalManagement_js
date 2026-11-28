'use strict';

const { organizationRepository, branchRepository, userRepository } = require('../repositories');
const profileService = require('./profileService');
const organizationStatus = require('./organizationStatus');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const context = require('../utils/context');
const { withTransaction } = require('../utils/transaction');
const { ROLES } = require('../utils/constants');

const HEAD_OFFICE = { name: 'Head Office', code: 'HO' };

/** Platform-operator actions across organisations. Routes run under `withoutTenant('platform')`. */
class PlatformService {
  constructor({
    organizations = organizationRepository,
    branches = branchRepository,
    users = userRepository,
    profiles = profileService,
    status = organizationStatus,
  } = {}) {
    Object.assign(this, { organizations, branches, users, profiles, status });
  }

  /**
   * Organisation + head-office branch + default registration branch + first
   * admin, atomically. Without transaction support (standalone mongod) a
   * failure is compensated by deleting what was created.
   */
  async createOrganization({ admin, headOfficeBranch = HEAD_OFFICE, ...orgInput }) {
    const created = {};
    try {
      return await withTransaction(async (session) => {
        const org = (created.org = await this.organizations.create(orgInput, { session }));

        // Tenant documents are created inside the new organisation's own scope.
        return context.runAs({ organizationId: org._id, source: 'http' }, async () => {
          const branch = (created.branch = await this.branches.create(
            { ...headOfficeBranch, isHeadOffice: true },
            { session }
          ));
          org.defaultRegistrationBranch = branch._id;
          await org.save({ session });

          const user = (created.user = await this.users.create(
            {
              name: admin.name,
              email: admin.email,
              password: admin.password,
              role: ROLES.ADMIN,
              branches: [branch._id],
              defaultBranch: branch._id,
            },
            { session }
          ));
          await this.profiles.createProfile(
            { userId: user._id, role: ROLES.ADMIN, profile: { designation: 'Administrator' } },
            { session }
          );

          logger.info('Organization created', { organizationId: String(org._id), code: org.code });
          return { organization: org.toJSON(), branch: branch.toJSON(), admin: user.toJSON() };
        });
      });
    } catch (error) {
      await this._compensate(created);
      throw error;
    }
  }

  /** Cleanup for the no-transaction path; deleting already-aborted writes is harmless. */
  async _compensate({ org, branch, user }) {
    if (!org) return;
    try {
      await context.runAs({ organizationId: org._id, source: 'http' }, async () => {
        if (user) {
          await this.profiles.deleteForUser(user._id, ROLES.ADMIN);
          await this.users.deleteById(user._id);
        }
        if (branch) await this.branches.deleteById(branch._id);
      });
      await this.organizations.deleteById(org._id);
    } catch (cleanupError) {
      logger.error('Failed to roll back organization creation', { error: cleanupError.message });
    }
  }

  list(query = {}) {
    const filter = { ...this.organizations.searchFilter(query.search) };
    if (query.status) filter.status = query.status;
    return this.organizations.paginate(filter, query);
  }

  async update(id, changes) {
    const updated = await this.organizations.updateById(id, { $set: changes });
    if (!updated) throw ApiError.notFound('Organization');
    this.status.clear(id);
    return updated;
  }
}

module.exports = new PlatformService();
module.exports.PlatformService = PlatformService;
