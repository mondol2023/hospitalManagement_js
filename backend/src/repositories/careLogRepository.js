'use strict';

const BaseRepository = require('./BaseRepository');
const { CareLog } = require('../models');
const { CARE_LOG_TYPE, MEDICATION_STATUS } = require('../utils/constants');

/**
 * Bedside record queries.
 *
 * Every method here is staff-facing. There is deliberately no "for patient user"
 * read: the access rule is enforced at the route (staff roles only) and narrowed
 * by the care-team guard, and this repository offers no query shaped to serve a
 * patient, so a mistake upstream cannot accidentally expose the log.
 */
class CareLogRepository extends BaseRepository {
  constructor() {
    super(CareLog, {
      sortableFields: ['performedAt', 'type'],
      defaultSort: { performedAt: -1 },
    });
  }

  /**
   * The patient's chronological timeline — the hottest clinical read. `type` and
   * a date range narrow it onto the compound index rather than filtering in
   * memory.
   */
  timelineFor(patientId, query = {}) {
    const filter = { patient: patientId, supersededBy: null };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.performedAt = {};
      if (query.from) filter.performedAt.$gte = new Date(query.from);
      if (query.to) filter.performedAt.$lte = new Date(query.to);
    }

    return this.paginate(filter, query, {
      populate: [
        { path: 'recordedBy', select: 'name role' },
        { path: 'bed', select: 'bedNumber ward' },
      ],
    });
  }

  /** The ward feed at the nurses' station. */
  wardFeed(ward, query = {}) {
    return this.paginate({ ward, supersededBy: null }, query, {
      populate: [
        { path: 'recordedBy', select: 'name role' },
        { path: 'patient', select: 'medicalRecordNumber user' },
      ],
    });
  }

  /** A nurse's own entries — used for shift review and handover. */
  recordedByUser(userId, query = {}) {
    return this.paginate({ recordedBy: userId }, query);
  }

  /**
   * The attention queue: flagged entries no one has picked up. Backed by the
   * partial index, so the queue stays cheap regardless of how large the
   * collection grows.
   */
  attentionQueue({ ward } = {}, query = {}) {
    const filter = { requiresAttention: true, acknowledgedAt: null, supersededBy: null };
    if (ward) filter.ward = ward;
    return this.paginate(filter, query, {
      populate: [
        { path: 'patient', select: 'medicalRecordNumber user ward' },
        { path: 'recordedBy', select: 'name role' },
      ],
      lean: true,
    });
  }

  countUnacknowledged(ward) {
    const filter = { requiresAttention: true, acknowledgedAt: null };
    if (ward) filter.ward = ward;
    return this.count(filter);
  }

  /** Doses still outstanding in a window — drives the medication-due reminder. */
  medicationDue(from, to) {
    return this.model
      .find({
        type: CARE_LOG_TYPE.MEDICATION,
        'medication.status': MEDICATION_STATUS.SCHEDULED,
        'medication.scheduledFor': { $gte: from, $lte: to },
      })
      .select('patient ward medication performedAt')
      .lean()
      .exec();
  }

  /** Delivered services not yet on an invoice — the billing sweep. */
  unbilledServices(patientId) {
    return this.model
      .find({
        patient: patientId,
        bill: null,
        'service.chargeableCents': { $gt: 0 },
      })
      .select('service performedAt type')
      .lean()
      .exec();
  }

  markBilled(careLogIds, billId, { session } = {}) {
    return this.updateMany({ _id: { $in: careLogIds } }, { $set: { bill: billId } }, { session });
  }

  /** The most recent vitals set, for the "current observations" panel. */
  latestVitals(patientId) {
    return this.findOne(
      { patient: patientId, type: CARE_LOG_TYPE.VITALS, supersededBy: null },
      { sort: { performedAt: -1 }, projection: { vitals: 1, performedAt: 1, recordedBy: 1 } }
    );
  }
}

module.exports = new CareLogRepository();
