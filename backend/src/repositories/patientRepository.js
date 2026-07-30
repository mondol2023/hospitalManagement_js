'use strict';

const BaseRepository = require('./BaseRepository');
const { Patient } = require('../models');

class PatientRepository extends BaseRepository {
  constructor() {
    super(Patient, {
      sortableFields: ['admittedAt', 'age', 'medicalRecordNumber'],
      searchableFields: ['medicalRecordNumber', 'ward'],
    });
  }

  findByUser(userId, options = {}) {
    return this.findOne({ user: userId }, options);
  }

  findByMrn(mrn) {
    return this.findOne({ medicalRecordNumber: String(mrn).toUpperCase().trim() });
  }

  /**
   * The care-team membership check needs schema methods (`isCareTeamMember`), so
   * this deliberately returns a hydrated document.
   */
  findDocWithCareTeam(patientId) {
    return this.model.findById(patientId).select('+primaryDoctor +assignedNurses').exec();
  }

  /** A nurse's caseload — the first query of every shift. Uses the multikey index. */
  assignedTo(nurseUserId, query = {}) {
    return this.paginate({ assignedNurses: nurseUserId, isAdmitted: true }, query, {
      populate: { path: 'user', select: 'name phone' },
    });
  }

  /** Ward census board. */
  admittedInWard(ward, query = {}) {
    return this.paginate({ ward, isAdmitted: true }, query, {
      populate: [
        { path: 'user', select: 'name phone' },
        { path: 'bed', select: 'bedNumber ward type status' },
      ],
    });
  }

  /**
   * Adds nurses to the care team without duplicating existing members.
   * `$addToSet` makes this idempotent, so a double-submit cannot corrupt the list.
   */
  assignNurses(patientId, nurseUserIds) {
    return this.updateById(patientId, { $addToSet: { assignedNurses: { $each: nurseUserIds } } });
  }

  unassignNurse(patientId, nurseUserId) {
    return this.updateById(patientId, { $pull: { assignedNurses: nurseUserId } });
  }

  /** Keeps the denormalised bed/ward pair on the patient consistent in one write. */
  setBed(patientId, { bed, ward }, options = {}) {
    return this.updateById(patientId, { $set: { bed, ward } }, options);
  }
}

module.exports = new PatientRepository();
