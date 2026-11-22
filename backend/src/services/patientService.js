'use strict';

const {
  patientRepository,
  nurseRepository,
  userRepository,
  doctorRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { ROLES, NOTIFICATION_TYPE } = require('../utils/constants');
const notificationService = require('./notificationService');
const bedService = require('./bedService');
const storageProvider = require('./providers/storageProvider');

/** Patient records and care-team composition. */
class PatientService {
  constructor({
    patients = patientRepository,
    nurses = nurseRepository,
    users = userRepository,
    doctors = doctorRepository,
    notifications = notificationService,
    beds = bedService,
    storage = storageProvider,
  } = {}) {
    this.patients = patients;
    this.nurses = nurses;
    this.users = users;
    this.doctors = doctors;
    this.notifications = notifications;
    this.beds = beds;
    this.storage = storage;
  }

  /** Loads a patient and asserts the actor may see it. */
  async requireVisible(patientId, actor) {
    const patient = await this.patients.findByIdOrThrow(patientId, 'Patient', {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
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

  /** Replaces the patient's own profile picture (stored on the user account). */
  async setAvatar(userId, file) {
    if (!file) throw ApiError.badRequest('An image file is required');
    await this.requireOwnRecord(userId);
    const { url } = await this.storage.upload(file, { folder: 'avatars' });
    const user = await this.users.updateById(userId, { $set: { profilePic: url } });
    return { profilePic: user.profilePic };
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

  /** Adds nurses to the care team. */
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
    const patient = await this.patients.findByIdOrThrow(patientId, 'Patient', {
      projection: 'user primaryDoctor assignedNurses medicalRecordNumber',
    });
    return {
      patientUserId: accessPolicy.toId(patient.user),
      clinicianUserIds: accessPolicy.careTeamIds(patient),
    };
  }

  /**
   * The care team as people, for display: names, photos and the doctor's
   * specialty. Deliberately no `email` or `phone` — a patient reaches the team
   * through care-team chat, and staff contact details are not theirs to hold.
   *
   * Two queries however many nurses there are (users, plus the doctor's profile).
   * A member whose account no longer exists is left out rather than returned as
   * a null entry the client would have to guard against.
   *
   * @param {object} patient a patient document carrying `primaryDoctor` and `assignedNurses`
   * @returns {Promise<{primaryDoctor: object|null, nurses: object[]}>}
   */
  async careTeamProfile(patient) {
    const doctorId = patient.primaryDoctor ? accessPolicy.toId(patient.primaryDoctor) : null;
    const nurseIds = [...new Set((patient.assignedNurses || []).map(accessPolicy.toId))].filter(
      Boolean
    );
    const userIds = doctorId ? [doctorId, ...nurseIds] : nurseIds;
    if (!userIds.length) return { primaryDoctor: null, nurses: [] };

    const [users, doctorProfile] = await Promise.all([
      this.users.find(
        { _id: { $in: userIds } },
        { projection: 'name profilePic', limit: userIds.length }
      ),
      doctorId ? this.doctors.findByUser(doctorId, { projection: 'specialization department' }) : null,
    ]);
    const byId = new Map(users.map((user) => [String(user._id), user]));

    const person = (id) => {
      const user = byId.get(id);
      if (!user) return null;
      return {
        id,
        name: user.name,
        ...(user.profilePic ? { profilePic: user.profilePic } : {}),
      };
    };

    const doctor = doctorId ? person(doctorId) : null;
    if (doctor && doctorProfile) {
      if (doctorProfile.specialization) doctor.specialization = doctorProfile.specialization;
      if (doctorProfile.department) doctor.department = doctorProfile.department;
    }

    return { primaryDoctor: doctor, nurses: nurseIds.map(person).filter(Boolean) };
  }

  /** Discharge. */
  async discharge(patientId, { summary } = {}, actor) {
    await this._releaseBed(patientId, actor);

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

  /**
   * @private frees the discharged patient's bed, tolerating the two states that
   * mean "there is nothing to free". Anything else is a real fault and is left
   * to propagate rather than silently stranding inventory.
   */
  async _releaseBed(patientId, actor) {
    try {
      await this.beds.release(patientId, actor);
    } catch (error) {
      const nothingToRelease =
        error instanceof ApiError && (error.statusCode === 400 || error.statusCode === 409);
      if (!nothingToRelease) throw error;
      logger.warn('Discharge released no bed', {
        patientId: String(patientId),
        reason: error.message,
      });
    }
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
