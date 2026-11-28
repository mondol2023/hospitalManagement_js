'use strict';

const BaseRepository = require('./BaseRepository');
const { Bed, Department } = require('../models');
const { BED_STATUS } = require('../utils/constants');

const WARD = { path: 'ward', select: 'name' };

/** `{ id -> name }` for the given ward ids. */
async function wardNames(ids) {
  const rows = await Department.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(rows.map((r) => [String(r._id), r.name]));
}

class BedRepository extends BaseRepository {
  constructor() {
    super(Bed, {
      sortableFields: ['bedNumber', 'ward', 'status', 'dailyRate'],
      defaultSort: { ward: 1, bedNumber: 1 },
      searchableFields: ['bedNumber'],
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
      .populate(WARD)
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
      .populate(WARD)
      .lean()
      .exec();
  }

  findAvailable({ ward, type } = {}) {
    const filter = { status: BED_STATUS.AVAILABLE };
    if (ward) filter.ward = ward;
    if (type) filter.type = type;
    return this.model.find(filter).select('bedNumber ward type dailyRate floor').populate(WARD).lean().exec();
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
  async occupancyByWard() {
    const rows = await this.aggregate([
      { $group: { _id: { ward: '$ward', status: '$status' }, count: { $sum: 1 } } },
      {
        $group: {
          _id: '$_id.ward',
          total: { $sum: '$count' },
          byStatus: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $project: { _id: 0, ward: '$_id', total: 1, byStatus: 1 } },
    ]);
    // `ward` is a Department id; the board shows the name and keeps the id alongside.
    const names = await wardNames(rows.map((r) => r.ward));
    return rows
      .map((r) => ({ ...r, wardId: r.ward, ward: names.get(String(r.ward)) || String(r.ward) }))
      .sort((a, b) => a.ward.localeCompare(b.ward));
  }

  async wards() {
    const ids = await this.model.distinct('ward').exec();
    return [...(await wardNames(ids)).values()].sort();
  }
}

module.exports = new BedRepository();
