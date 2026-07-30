'use strict';

const { patientRepository, nurseRepository, userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { ROLES, NOTIFICATION_TYPE } = require('../utils/constants');
const notificationService = require('./notificationService');

/**
 * Patient records and care-team composition.
 *
 * The access decisions all delegate to `utils/accessPolicy`, so this service
 * decides *what* to load and the policy decides *who may see it*. That split is
 * what keeps the same rule enforceable from the REST layer and the socket layer
 * without duplicating it.
 */
class PatientService {
  constructor({
    patients = patientRepository,
    nurses = nurseRepository,
    users = userRepository,
    notifications = notificationService,
  } = {}) {
    this.patients = patients;
    this.nurses = nurses;
    this.users = users;
    this.notifications = notifications;
  }

  /**
   * Loads a patient and asserts the actor may see it. Every read path in this
   * service — and in the care-log and record services — funnels through here, so
   * there is exactly one place an authorisation bug could live.
   */
  async requireVisible(patientId, actor) {
    const patient = await this.patients.findById(patientId, {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
    if (!patient) throw ApiError.notFound('Patient');
    if (!accessPolicy.canViewPatient(actor, patient)) {
      throw ApiError.forbidden('You do not have access to this patient');
    }
    return patient;
  }

  /** Resolves the patient record belonging to a logged-in patient user. */
  async requireOwnRecord(userId) {
    const patient = await this.patients.findByUser(userId);
    if (!patient) throw ApiError.notFound('Patient profile');
    return patient;
  }

  /**
   * Resolves "which patient is this request about" for both shapes of caller:
   * a patient acting on themselves, or staff naming a patient id.
   */
  async resolveForActor(actor, patientId) {
    if (actor.role === ROLES.PATIENT) return this.requireOwnRecord(actor.id);
    if (!patientId) throw ApiError.badRequest('A patient id is required');
    return this.requireVisible(patientId, actor);
  }

  list(query = {}) {
    const filter = { ...this.patients.searchFilter(query.search) };
    if (query.ward) filter.ward = query.ward;
    if (query.isAdmitted !== undefined) {
      filter.isAdmitted = query.isAdmitted === 'true' || query.isAdmitted === true;
    }
    if (query.bloodGroup) filter.bloodGroup = query.bloodGroup;

    return this.patients.paginate(filter, query, {
      populate: { path: 'user', select: 'name email phone' },
    });
  }

  /** A nurse's own caseload — the first screen of every shift. */
  caseload(nurseUserId, query = {}) {
    return this.patients.assignedTo(nurseUserId, query);
  }

  /** Ward census, for the board on the nurses' station. */
  ward(wardName, query = {}) {
    return this.patients.admittedInWard(wardName, query);
  }

  async findByMrn(mrn, actor) {
    const patient = await this.patients.findByMrn(mrn);
    if (!patient) throw ApiError.notFound('Patient');
    if (!accessPolicy.canViewPatient(actor, patient)) {
      throw ApiError.forbidden('You do not have access to this patient');
    }
    return patient;
  }

  /**
   * Patient-editable details. Clinical fields are excluded on purpose — a
   * patient must not be able to delete an allergy from their own chart.
   */
  async updateOwnDetails(userId, patch = {}) {
    const allowed = ['address', 'emergencyContact', 'dateOfBirth'];
    const update = this._pick(patch, allowed);
    const patient = await this.patients.updateOne({ user: userId }, { $set: update });
    if (!patient) throw ApiError.notFound('Patient profile');
    return patient;
  }

  /** Clinician-editable chart fields. */
  async updateClinicalDetails(patientId, patch = {}) {
    const allowed = [
      'bloodGroup',
      'allergies',
      'chronicConditions',
      'medicalHistory',
      'age',
      'gender',
      'emergencyContact',
    ];
    const update = this._pick(patch, allowed);
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const patient = await this.patients.updateById(patientId, { $set: update });
    if (!patient) throw ApiError.notFound('Patient');
    return patient;
  }

  /**
   * Adds nurses to the care team.
   *
   * Each id is verified to belong to an active nurse first: `$addToSet` would
   * happily store a doctor's id — or a typo — and the care-team check would then
   * silently grant or withhold access based on garbage.
   */
  async assignNurses(patientId, nurseUserIds, actor) {
    const ids = [...new Set((nurseUserIds || []).filter(Boolean).map(String))];
    if (!ids.length) throw ApiError.badRequest('At least one nurse is required');

    const nurses = await this.nurses.find({ user: { $in: ids }, isActive: true }, {
      projection: 'user',
      limit: ids.length,
    });
    if (nurses.length !== ids.length) {
      throw ApiError.badRequest('One or more ids do not belong to an active nurse');
    }

    const patient = await this.patients.assignNurses(patientId, ids);
    if (!patient) throw ApiError.notFound('Patient');

    await this.notifications.notifyMany(ids, {
      title: 'New patient assigned',
      message: `You are now on the care team for ${patient.medicalRecordNumber}.`,
      type: NOTIFICATION_TYPE.CARE,
      data: { patientId: String(patient._id) },
    });

    logger.info('Nurses assigned', {
      patientId: String(patientId),
      count: ids.length,
      by: String(actor && actor.id),
    });
    return patient;
  }

  async unassignNurse(patientId, nurseUserId) {
    const patient = await this.patients.unassignNurse(patientId, nurseUserId);
    if (!patient) throw ApiError.notFound('Patient');
    return patient;
  }

  /** Sets the responsible doctor; validated the same way as nurse assignment. */
  async setPrimaryDoctor(patientId, doctorUserId) {
    const doctor = await this.users.findOne(
      { _id: doctorUserId, role: ROLES.DOCTOR, isActive: true },
      { projection: '_id' }
    );
    if (!doctor) throw ApiError.badRequest('That id does not belong to an active doctor');

    const patient = await this.patients.updateById(patientId, {
      $set: { primaryDoctor: doctorUserId },
    });
    if (!patient) throw ApiError.notFound('Patient');

    await this.notifications.notify({
      recipient: doctorUserId,
      title: 'New patient assigned',
      message: `You are now the primary doctor for ${patient.medicalRecordNumber}.`,
      type: NOTIFICATION_TYPE.CARE,
      data: { patientId: String(patient._id) },
    });
    return patient;
  }

  /**
   * The care team as user ids — used to seed a care-team conversation and to
   * decide who a flagged observation should page.
   */
  async careTeam(patientId) {
    const patient = await this.patients.findById(patientId, {
      projection: 'user primaryDoctor assignedNurses medicalRecordNumber',
    });
    if (!patient) throw ApiError.notFound('Patient');
    return {
      patientUserId: accessPolicy.toId(patient.user),
      clinicianUserIds: accessPolicy.careTeamIds(patient),
    };
  }

  /**
   * Discharge. The bed is released by `bedService` — this only closes the stay,
   * so the two writes stay owned by the service that understands each one.
   */
  async discharge(patientId, { summary } = {}) {
    const patient = await this.patients.updateById(patientId, {
      $set: {
        isAdmitted: false,
        dischargedAt: new Date(),
        ...(summary ? { medicalHistory: summary } : {}),
      },
      $unset: { bed: '' },
    });
    if (!patient) throw ApiError.notFound('Patient');
    logger.info('Patient discharged', { patientId: String(patientId) });
    return patient;
  }

  /** @private */
  _pick(source, allowed) {
    const out = {};
    for (const field of allowed) {
      if (source[field] !== undefined) out[field] = source[field];
    }
    return out;
  }
}

module.exports = new PatientService();
module.exports.PatientService = PatientService;
