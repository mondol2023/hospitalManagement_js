'use strict';

const { nurseRepository, patientRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Nursing roster: who works which ward, who is on the floor right now.
 *
 * `coveredWards` is the important one — `utils/accessPolicy.canWriteCareData`
 * needs it to decide whether a nurse may chart against a patient they are not
 * formally assigned to. It is a hot lookup on every bedside write, so it is
 * projected down to the one field it needs.
 */
class NurseService {
  constructor({ nurses = nurseRepository, patients = patientRepository } = {}) {
    this.nurses = nurses;
    this.patients = patients;
  }

  list(query = {}) {
    const filter = { ...this.nurses.searchFilter(query.search), isActive: true };
    if (query.ward) filter.assignedWards = query.ward;
    if (query.grade) filter.grade = query.grade;
    if (query.onDuty !== undefined) {
      filter.isOnDuty = query.onDuty === 'true' || query.onDuty === true;
    }
    return this.nurses.paginate(filter, query, {
      populate: { path: 'user', select: 'name email phone' },
    });
  }

  async getByUser(userId) {
    const nurse = await this.nurses.findByUser(userId, {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
    if (!nurse) throw ApiError.notFound('Nurse profile');
    return nurse;
  }

  /**
   * Wards this nurse may act in.
   *
   * @returns {Promise<string[]|undefined>} the ward list — empty means "float
   *   nurse, every ward" — or `undefined` when the user has no nurse profile,
   *   which the policy reads as "coverage does not apply".
   */
  async coveredWards(userId) {
    const nurse = await this.nurses.findByUser(userId, { projection: 'assignedWards isActive' });
    if (!nurse || !nurse.isActive) return undefined;
    return nurse.assignedWards || [];
  }

  /** On-duty nurses for a ward, used for handover targets and ward alerts. */
  onDutyInWard(ward) {
    return this.nurses.onDutyInWard(ward);
  }

  /** Everyone with bedside authority in a ward — rostered staff plus float nurses. */
  withAuthorityInWard(ward) {
    return this.nurses.withAuthorityInWard(ward);
  }

  async updateOwnProfile(userId, patch = {}) {
    const allowed = [
      'qualifications',
      'licenseNumber',
      'experienceInYears',
      'department',
      'shift',
    ];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const nurse = await this.nurses.updateOne({ user: userId }, { $set: update });
    if (!nurse) throw ApiError.notFound('Nurse profile');
    return nurse;
  }

  /**
   * Ward assignment and grade are roster decisions, so they are separated from
   * the self-service fields above and gated on an administrator in the routes.
   */
  async updateRoster(nurseProfileId, { assignedWards, grade, supervisor, maxPatients }) {
    const update = {};
    if (assignedWards !== undefined) update.assignedWards = assignedWards;
    if (grade !== undefined) update.grade = grade;
    if (supervisor !== undefined) update.supervisor = supervisor;
    if (maxPatients !== undefined) update.maxPatients = maxPatients;
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const nurse = await this.nurses.updateById(nurseProfileId, { $set: update });
    if (!nurse) throw ApiError.notFound('Nurse');
    logger.info('Nurse roster updated', { nurseId: String(nurseProfileId) });
    return nurse;
  }

  async setDuty(userId, isOnDuty) {
    const nurse = await this.nurses.setDuty(userId, isOnDuty);
    if (!nurse) throw ApiError.notFound('Nurse profile');
    logger.info('Nurse duty changed', { userId: String(userId), isOnDuty });
    return nurse;
  }

  /**
   * Workload snapshot: assigned patients against the nurse's declared ceiling.
   * Assignment endpoints use it to warn before pushing someone over capacity.
   */
  async workload(userId) {
    const nurse = await this.nurses.findByUser(userId, { projection: 'maxPatients assignedWards' });
    if (!nurse) throw ApiError.notFound('Nurse profile');

    const assigned = await this.patients.count({ assignedNurses: userId, isAdmitted: true });
    return {
      assigned,
      capacity: nurse.maxPatients,
      atCapacity: assigned >= nurse.maxPatients,
    };
  }
}

module.exports = new NurseService();
module.exports.NurseService = NurseService;
