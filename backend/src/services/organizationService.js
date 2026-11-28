'use strict';

const { organizationRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const context = require('../utils/context');

/** The caller's own organisation (profile fields only; `code` is immutable). */
class OrganizationService {
  constructor({ organizations = organizationRepository } = {}) {
    this.organizations = organizations;
  }

  async getOwn() {
    const { organizationId } = context.require();
    return this.organizations.findByIdOrThrow(organizationId, 'Organization');
  }

  async updateOwn(changes) {
    const { organizationId } = context.require();
    const updated = await this.organizations.updateById(organizationId, { $set: changes });
    if (!updated) throw ApiError.notFound('Organization');
    return updated;
  }
}

module.exports = new OrganizationService();
module.exports.OrganizationService = OrganizationService;
