'use strict';

const { branchRepository, organizationRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const context = require('../utils/context');
const { ROLES } = require('../utils/constants');

/** Branches of the active organisation. Admins see all; other staff only their memberships. */
class BranchService {
  constructor({ branches = branchRepository, organizations = organizationRepository } = {}) {
    this.branches = branches;
    this.organizations = organizations;
  }

  list(query = {}) {
    const store = context.require();
    const filter = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (!(store.roles || []).includes(ROLES.ADMIN)) filter._id = { $in: store.branchIds || [] };
    return this.branches.paginate(filter, query);
  }

  async create(input) {
    const branch = await this.branches.create(input);
    return branch.toJSON();
  }

  async update(id, changes) {
    const { organizationId } = context.require();
    if (changes.isActive === false) {
      // Patients register into this branch, so it can never be switched off.
      const org = await this.organizations.findById(organizationId, {
        projection: 'defaultRegistrationBranch',
      });
      if (org?.defaultRegistrationBranch && String(org.defaultRegistrationBranch) === String(id)) {
        throw ApiError.conflict('The default registration branch cannot be deactivated', {
          code: 'DEFAULT_BRANCH_REQUIRED',
        });
      }
    }
    const updated = await this.branches.updateById(id, { $set: changes });
    if (!updated) throw ApiError.notFound('Branch');
    return updated;
  }
}

module.exports = new BranchService();
module.exports.BranchService = BranchService;
