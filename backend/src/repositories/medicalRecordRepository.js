'use strict';

const BaseRepository = require('./BaseRepository');
const { MedicalRecord } = require('../models');

class MedicalRecordRepository extends BaseRepository {
  constructor() {
    super(MedicalRecord, {
      sortableFields: ['visitDate', 'followUpDate'],
      defaultSort: { visitDate: -1 },
    });
  }

  /** The patient's chart. */
  chartFor(patientId, query = {}) {
    return this.paginate({ patient: patientId }, query, {
      populate: { path: 'doctor', select: 'name email' },
    });
  }

  listForDoctor(doctorUserId, query = {}) {
    return this.paginate({ doctor: doctorUserId }, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber user' },
    });
  }

  latestFor(patientId) {
    return this.findOne({ patient: patientId }, { sort: { visitDate: -1 } });
  }

  /** Follow-ups falling due — feeds the reminder sweep. */
  followUpsDue(from, to) {
    return this.model
      .find({ followUpDate: { $gte: from, $lt: to } })
      .select('patient doctor followUpDate')
      .lean()
      .exec();
  }
}

module.exports = new MedicalRecordRepository();
