'use strict';

const BaseRepository = require('./BaseRepository');
const { Nurse } = require('../models');

class NurseRepository extends BaseRepository {
  constructor() {
    super(Nurse, {
      sortableFields: ['grade', 'experienceInYears', 'department'],
      searchableFields: ['qualifications', 'employeeId'],
    });
  }

  findByUser(userId, options = {}) {
    return this.findOne({ user: userId }, options);
  }

  /** Ward-coverage checks call `covers()`, which only exists on a document. */
  findDocByUser(userId) {
    return this.findDocOne({ user: userId });
  }

  /**
   * Who is currently on the floor for a ward. Drives handover targets and the
   * "notify the ward" fan-out on a flagged care log.
   */
  onDutyInWard(ward) {
    return this.model
      .find({ isOnDuty: true, isActive: true, assignedWards: ward })
      .select('user assignedWards grade')
      .populate({ path: 'user', select: 'name' })
      .lean()
      .exec();
  }

  /**
   * Float nurses (no ward restriction) plus the ward's own staff — the full set
   * with bedside authority there.
   */
  withAuthorityInWard(ward) {
    return this.model
      .find({
        isActive: true,
        $or: [{ assignedWards: ward }, { assignedWards: { $size: 0 } }],
      })
      .select('user assignedWards grade isOnDuty')
      .lean()
      .exec();
  }

  setDuty(userId, isOnDuty) {
    return this.updateOne({ user: userId }, { $set: { isOnDuty } });
  }
}

module.exports = new NurseRepository();
