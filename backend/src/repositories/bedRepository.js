'use strict';

const BaseRepository = require('./BaseRepository');
const { Bed } = require('../models');
const { BED_STATUS } = require('../utils/constants');

class BedRepository extends BaseRepository {
  constructor() {
    super(Bed, {
      sortableFields: ['bedNumber', 'ward', 'status', 'dailyRate'],
      defaultSort: { ward: 1, bedNumber: 1 },
      searchableFields: ['bedNumber', 'ward'],
    });
  }

  /**
   * Claims a free bed atomically.
   *
   * The status check lives in the filter, not in a preceding read: two nurses
   * admitting at the same instant would both pass a read-then-write check and
   * the second would silently overwrite the first. Here the loser's filter
   * matches nothing and the method returns null, which the service turns into a
   * 409.
   */
  occupyIfFree(bedId, patientId, { session } = {}) {
    return this.model
      .findOneAndUpdate(
        { _id: bedId, status: BED_STATUS.AVAILABLE },
        { $set: { status: BED_STATUS.OCCUPIED, patient: patientId, occupiedAt: new Date() } },
        { new: true, session }
      )
      .lean()
      .exec();
  }

  /** Releases a bed, but only if this patient is the one actually in it. */
  release(bedId, patientId, { session } = {}) {
    const filter = { _id: bedId };
    if (patientId) filter.patient = patientId;
    return this.model
      .findOneAndUpdate(
        filter,
        { $set: { status: BED_STATUS.CLEANING, patient: null, occupiedAt: null } },
        { new: true, session }
      )
      .lean()
      .exec();
  }

  findAvailable({ ward, type } = {}) {
    const filter = { status: BED_STATUS.AVAILABLE };
    if (ward) filter.ward = ward;
    if (type) filter.type = type;
    return this.model.find(filter).select('bedNumber ward type dailyRate floor').lean().exec();
  }

  findByPatient(patientId) {
    return this.findOne({ patient: patientId });
  }

  /**
   * Occupancy board: counts per ward per status, in one round trip.
   *
   * The final `$project` renames the grouping key to `ward`. Leaving it as `_id`
   * would ship a ward *name* in the field every client reads as a document id —
   * and the response serialiser, which turns `_id` into `id`, would make it look
   * even more like one.
   */
  occupancyByWard() {
    return this.aggregate([
      { $group: { _id: { ward: '$ward', status: '$status' }, count: { $sum: 1 } } },
      {
        $group: {
          _id: '$_id.ward',
          total: { $sum: '$count' },
          byStatus: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, ward: '$_id', total: 1, byStatus: 1 } },
    ]);
  }

  wards() {
    return this.model.distinct('ward').exec();
  }
}

module.exports = new BedRepository();
