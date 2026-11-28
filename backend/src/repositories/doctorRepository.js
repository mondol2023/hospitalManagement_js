'use strict';

const BaseRepository = require('./BaseRepository');
const { Doctor } = require('../models');

class DoctorRepository extends BaseRepository {
  constructor() {
    super(Doctor, {
      sortableFields: ['experienceInYears', 'consultationFeeCents', 'specialization'],
      searchableFields: ['specialization', 'qualifications'],
    });
  }

  findByUser(userId, options = {}) {
    return this.findOne({ user: userId }, options);
  }

  /** Availability check needs `worksOn()`, so a hydrated document is required. */
  findDocByUser(userId) {
    return this.findDocOne({ user: userId });
  }

  /** The public "find a doctor" directory. */
  listAvailable(filter = {}, query = {}) {
    return this.paginate(
      { ...filter, isActive: true, isAcceptingPatients: true },
      query,
      { populate: [{ path: 'user', select: 'name email profilePic' }, { path: 'department', select: 'name' }] }
    );
  }

  /**
   * The roster page: same shape as the directory, but whatever `isActive` and
   * `isAcceptingPatients` the caller put in `filter` is respected, and none is
   * forced. Only the service, after checking the caller is an administrator,
   * may reach this.
   */
  listForAdmin(filter = {}, query = {}) {
    return this.paginate(filter, query, {
      populate: { path: 'user', select: 'name email profilePic' },
    });
  }

  specializations() {
    return this.model.distinct('specialization', { isActive: true }).exec();
  }
}

module.exports = new DoctorRepository();
