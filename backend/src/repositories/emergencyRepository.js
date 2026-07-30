'use strict';

const BaseRepository = require('./BaseRepository');
const { Emergency } = require('../models');
const { EMERGENCY_STATUS } = require('../utils/constants');

const OPEN_STATUSES = [EMERGENCY_STATUS.OPEN, EMERGENCY_STATUS.ACKNOWLEDGED];

class EmergencyRepository extends BaseRepository {
  constructor() {
    super(Emergency, {
      sortableFields: ['severity', 'status'],
      defaultSort: { createdAt: -1 },
    });
  }

  get openStatuses() {
    return OPEN_STATUSES;
  }

  /** The live alerts board — served by the `{ status, severity, createdAt }` index. */
  activeBoard(query = {}) {
    const filter = { status: { $in: OPEN_STATUSES } };
    if (query.severity) filter.severity = query.severity;
    return this.paginate(filter, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber ward' },
    });
  }

  listForPatient(patientId, query = {}) {
    return this.paginate({ patient: patientId }, query);
  }

  countOpen() {
    return this.count({ status: { $in: OPEN_STATUSES } });
  }

  /**
   * First responder wins. The `acknowledgedAt: null` guard makes this a
   * compare-and-set, so a null return means somebody else already took the call
   * rather than silently overwriting their claim.
   */
  acknowledge(emergencyId, responderId) {
    return this.updateOne(
      { _id: emergencyId, acknowledgedAt: null },
      {
        $set: {
          status: EMERGENCY_STATUS.ACKNOWLEDGED,
          acknowledgedBy: responderId,
          acknowledgedAt: new Date(),
        },
      }
    );
  }
}

module.exports = new EmergencyRepository();
