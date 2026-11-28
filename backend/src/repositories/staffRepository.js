'use strict';

const BaseRepository = require('./BaseRepository');
const { Staff } = require('../models');

class StaffRepository extends BaseRepository {
  constructor() {
    super(Staff, {
      sortableFields: ['designation', 'role', 'joinedAt'],
      searchableFields: ['designation', 'employeeId'],
    });
  }

  findByUser(userId, options = {}) {
    return this.findOne({ user: userId }, options);
  }

  listByRole(role, query = {}) {
    return this.paginate({ role, isActive: true }, query, {
      populate: { path: 'user', select: 'name email phone' },
    });
  }

  /** Direct reports, for the org view and approval routing. */
  reportsTo(managerUserId) {
    return this.model
      .find({ reportsTo: managerUserId, isActive: true })
      .select('user designation role department')
      .populate({ path: 'department', select: 'name' })
      .lean()
      .exec();
  }
}

module.exports = new StaffRepository();
