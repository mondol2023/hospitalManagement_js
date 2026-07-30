'use strict';

const { staffRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');

/**
 * Non-clinical employees — receptionists, pharmacists, accountants, managers and
 * administrators — all in one collection discriminated by `role`.
 *
 * Separate collections per job title would multiply the schema without adding a
 * single distinct field; the shared staff-profile plugin already supplies the
 * employment data, and `role` supplies the rest.
 */
class StaffService {
  constructor({ staff = staffRepository } = {}) {
    this.staff = staff;
  }

  list(query = {}) {
    const filter = { ...this.staff.searchFilter(query.search), isActive: true };
    if (query.role) filter.role = query.role;
    if (query.department) filter.department = query.department;
    return this.staff.paginate(filter, query, {
      populate: { path: 'user', select: 'name email phone' },
    });
  }

  async getByUser(userId) {
    const profile = await this.staff.findByUser(userId, {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
    if (!profile) throw ApiError.notFound('Staff profile');
    return profile;
  }

  /** Direct reports, for the org chart and approval routing. */
  reportsTo(managerUserId) {
    return this.staff.reportsTo(managerUserId);
  }

  async updateOwnProfile(userId, patch = {}) {
    const allowed = ['department', 'shift', 'notes'];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const profile = await this.staff.updateOne({ user: userId }, { $set: update });
    if (!profile) throw ApiError.notFound('Staff profile');
    return profile;
  }

  /**
   * Employment terms. `salaryCents` lives behind this admin-only path and is
   * never returned by the directory listing above.
   */
  async updateEmployment(staffProfileId, patch = {}) {
    const allowed = ['designation', 'employmentType', 'reportsTo', 'salaryCents', 'department'];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const profile = await this.staff.updateById(staffProfileId, { $set: update });
    if (!profile) throw ApiError.notFound('Staff member');
    return profile;
  }

  async setDuty(userId, isOnDuty) {
    const profile = await this.staff.updateOne({ user: userId }, { $set: { isOnDuty } });
    if (!profile) throw ApiError.notFound('Staff profile');
    return profile;
  }
}

module.exports = new StaffService();
module.exports.StaffService = StaffService;
