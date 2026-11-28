'use strict';

const BaseRepository = require('./BaseRepository');
const { Patient } = require('../models');
const context = require('../utils/context');

/** Admission is branch-specific while Patient is organisation-scoped. */
const activeBranch = () => context.activeBranchId();

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
    // Name and bed only: the desk confirms identity by MRN and date of birth, so
    // contact details stay out of the response.
    return this.findOne(
      { medicalRecordNumber: String(mrn).toUpperCase().trim() },
      {
        populate: [
          { path: 'user', select: 'name avatar' },
          { path: 'bed', select: 'bedNumber ward', populate: { path: 'ward', select: 'name' } },
        ],
      }
    );
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
    return this.paginate({ assignedNurses: nurseUserId, isAdmitted: true, admittedBranch: activeBranch() }, query, {
      populate: [
        { path: 'user', select: 'name phone' },
        { path: 'bed', select: 'bedNumber ward', populate: { path: 'ward', select: 'name' } },
      ],
    });
  }

  /** Ward census board. */
  admittedInWard(ward, query = {}) {
    return this.paginate({ ward, isAdmitted: true, admittedBranch: activeBranch() }, query, {
      populate: [
        { path: 'user', select: 'name phone' },
        { path: 'bed', select: 'bedNumber ward type status', populate: { path: 'ward', select: 'name' } },
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
