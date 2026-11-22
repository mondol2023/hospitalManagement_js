'use strict';

const {
  medicalRecordRepository,
  patientRepository,
  medicineRepository,
  appointmentRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { ROLES, NOTIFICATION_TYPE, APPOINTMENT_STATUS } = require('../utils/constants');
const notificationService = require('./notificationService');
const storageProvider = require('./providers/storageProvider');

const MAX_ATTACHMENTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

/** How far back an unmet follow-up still counts as overdue; older ones have lapsed. */
const OVERDUE_WINDOW_DAYS = 30;
const DEFAULT_FOLLOW_UP_DAYS = 7;

const alreadyRecorded = () =>
  ApiError.conflict('This visit already has a record', { code: 'APPOINTMENT_ALREADY_RECORDED' });

/** The clinical encounter record — diagnosis, treatment plan, prescriptions. */
class MedicalRecordService {
  constructor({
    records = medicalRecordRepository,
    patients = patientRepository,
    medicines = medicineRepository,
    appointments = appointmentRepository,
    notifications = notificationService,
    storage = storageProvider,
  } = {}) {
    this.records = records;
    this.patients = patients;
    this.medicines = medicines;
    this.appointments = appointments;
    this.notifications = notifications;
    this.storage = storage;
  }

  // --- Reads ----------------------------------------------------------------

  /** A patient's chart, most recent visit first. */
  async chart(patientId, actor, query = {}) {
    const patient = await this._requirePatient(patientId);
    this._assertCanRead(patient, actor);
    return this.records.chartFor(patient._id, query);
  }

  /** The doctor's own caseload. */
  listForDoctor(doctorUserId, actor, query = {}) {
    if (!accessPolicy.canReadCareData(actor)) {
      throw ApiError.forbidden('Medical records are visible to clinical staff only');
    }
    if (
      !accessPolicy.isAdmin(actor.role) &&
      String(doctorUserId) !== String(actor.id || actor._id)
    ) {
      throw ApiError.forbidden('You can only list your own records');
    }
    return this.records.listForDoctor(doctorUserId, query);
  }

  async getById(recordId, actor) {
    const record = await this.records.findByIdOrThrow(recordId, 'Medical record', {
      populate: [
        { path: 'doctor', select: 'name email' },
        { path: 'patient', select: 'medicalRecordNumber ward user' },
      ],
    });

    this._assertCanRead(record.patient, actor);
    return record;
  }

  /** The latest encounter — what the ward round opens with. */
  async latest(patientId, actor, { withVitals = false } = {}) {
    const patient = await this._requirePatient(patientId);
    this._assertCanRead(patient, actor);
    return this.records.latestFor(patient._id, { withVitals });
  }

  // --- Writes ---------------------------------------------------------------

  /** Records an encounter. */
  async create(payload = {}, actor) {
    this._assertDoctor(actor);
    const patient = await this._requirePatient(payload.patientId);

    if (!payload.diagnosis) throw ApiError.badRequest('A diagnosis is required');

    await this._assertLinkableAppointment(payload.appointmentId, patient, actor);
    const prescriptions = await this._resolvePrescriptions(payload.prescriptions);

    const record = await this._createRecord({
      patient: patient._id,
      doctor: actor.id,
      appointment: payload.appointmentId,
      visitDate: payload.visitDate || new Date(),
      chiefComplaint: payload.chiefComplaint,
      diagnosis: payload.diagnosis,
      treatmentPlan: payload.treatmentPlan,
      prescriptions,
      vitals: payload.vitals,
      notes: payload.notes,
      attachments: payload.attachments,
      followUpDate: payload.followUpDate,
    });

    this._notifyPatient(patient, record).catch((error) =>
      logger.error('Visit-summary notification failed', { error: error.message })
    );

    logger.info('Medical record created', {
      recordId: String(record._id),
      patientId: String(patient._id),
      doctor: String(actor.id),
    });
    return record.toJSON();
  }

  /**
   * @private the unique index on `appointment` is the authority when two
   * submissions race past `_assertLinkableAppointment`; its error becomes the
   * same 409 the check gives.
   */
  async _createRecord(doc) {
    try {
      return await this.records.create(doc);
    } catch (error) {
      if (error?.code === DUPLICATE_KEY && error.keyPattern?.appointment) throw alreadyRecorded();
      throw error;
    }
  }

  /**
   * @private a record may only claim this doctor's own visit with this patient,
   * and only once. Any status but cancelled: a doctor may write up a visit
   * before marking it complete.
   */
  async _assertLinkableAppointment(appointmentId, patient, actor) {
    if (!appointmentId) return;

    const appointment = await this.appointments.findById(appointmentId, {
      projection: 'patient doctor status',
    });
    if (!appointment) throw ApiError.notFound('Appointment');

    if (
      String(appointment.patient) !== String(patient._id) ||
      String(appointment.doctor) !== String(actor.id || actor._id)
    ) {
      throw ApiError.badRequest('That appointment is not this patient’s visit with you', {
        code: 'APPOINTMENT_MISMATCH',
      });
    }
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      throw ApiError.conflict('A cancelled appointment cannot be recorded', {
        code: 'APPOINTMENT_CANCELLED',
      });
    }
    if (await this.records.exists({ appointment: appointment._id })) throw alreadyRecorded();
  }

  /** Amends an encounter. */
  async update(recordId, patch = {}, actor) {
    await this._requireAuthor(recordId, actor);

    const allowed = [
      'chiefComplaint',
      'diagnosis',
      'treatmentPlan',
      'vitals',
      'notes',
      'attachments',
      'followUpDate',
    ];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (patch.prescriptions !== undefined) {
      update.prescriptions = await this._resolvePrescriptions(patch.prescriptions);
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const updated = await this.records.updateById(recordId, { $set: update });
    logger.info('Medical record amended', { recordId: String(recordId) });
    return updated;
  }

  /** Uploads scans/PDFs and appends them; the authoring doctor only, like `update`. */
  async addAttachments(recordId, files = [], actor) {
    const record = await this._requireAuthor(recordId, actor, 'attachments');
    if (!files.length) throw ApiError.badRequest('At least one file is required');
    if ((record.attachments?.length || 0) + files.length > MAX_ATTACHMENTS) {
      throw ApiError.conflict(`A record holds at most ${MAX_ATTACHMENTS} attachments`, {
        code: 'TOO_MANY_ATTACHMENTS',
      });
    }

    const stored = await Promise.all(
      files.map((file) => this.storage.upload(file, { folder: 'medical-records' }))
    );
    return this.records.updateById(recordId, { $push: { attachments: { $each: stored } } });
  }

  /** @private */
  async _requireAuthor(recordId, actor, projection = '') {
    const record = await this.records.findByIdOrThrow(recordId, 'Medical record', {
      projection: `doctor patient ${projection}`.trim(),
    });
    if (String(record.doctor) !== String(actor.id || actor._id)) {
      throw ApiError.forbidden('Only the authoring doctor can amend this record');
    }
    return record;
  }

  /**
   * Deletion is administrative only and exists for genuine mistakes — a record
   * filed against the wrong patient. Clinical corrections go through `update`.
   */
  async remove(recordId, actor) {
    if (!accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only an administrator can delete a medical record');
    }
    const removed = await this.records.deleteById(recordId);
    if (!removed) throw ApiError.notFound('Medical record');
    logger.warn('Medical record deleted', {
      recordId: String(recordId),
      by: String(actor.id),
    });
    return { removed: true };
  }

  // --- Follow-ups -----------------------------------------------------------

  /**
   * The follow-up listing, scoped to a caseload.
   *
   * A doctor sees only their own and may not name another doctor. An
   * administrator sees everyone's and may filter by `doctorId`. A nurse is a
   * care reader but has no caseload of their own here (D4).
   *
   * Upcoming: due in `[now, now + days)`. Overdue: due in the last
   * `OVERDUE_WINDOW_DAYS`, minus patients the same doctor has seen since.
   */
  listFollowUps(actor, { days = DEFAULT_FOLLOW_UP_DAYS, overdue = false, doctorId, ...query } = {}) {
    const actorId = String(actor.id || actor._id);
    let doctor;

    if (actor.role === ROLES.DOCTOR) {
      if (doctorId && String(doctorId) !== actorId) {
        throw ApiError.forbidden('You can only list your own follow-ups');
      }
      doctor = actorId;
    } else if (accessPolicy.isAdmin(actor.role)) {
      doctor = doctorId;
    } else {
      throw ApiError.forbidden('Follow-ups are listed for doctors and administrators');
    }

    const now = new Date();
    const window = overdue
      ? { from: new Date(now.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS), to: now }
      : { from: now, to: new Date(now.getTime() + days * DAY_MS) };

    return this.records.listFollowUps({ doctor, ...window, excludeReturned: overdue }, query);
  }

  /** Follow-ups falling due in the next `days` — the reminder's query, unpaged. */
  followUpsDue({ days = 1 } = {}) {
    const from = new Date();
    const to = new Date(from.getTime() + days * DAY_MS);
    return this.records.followUpsDue(from, to);
  }

  /** Reminds patients whose follow-up falls in the window. */
  async sendFollowUpReminders({ days = 1 } = {}) {
    const due = await this.followUpsDue({ days });
    let sent = 0;

    for (const record of due) {
      try {
        const patient = await this.patients.findById(record.patient, {
          projection: 'user medicalRecordNumber',
        });
        if (!patient || !patient.user) continue;

        await this.notifications.notify({
          recipient: patient.user,
          title: 'Follow-up due',
          message: `Your follow-up visit is scheduled for ${new Date(
            record.followUpDate
          ).toDateString()}.`,
          type: NOTIFICATION_TYPE.APPOINTMENT,
          data: { recordId: String(record._id) },
        });
        sent += 1;
      } catch (error) {
        logger.error('Follow-up reminder failed', {
          recordId: String(record._id),
          error: error.message,
        });
      }
    }

    logger.info('Follow-up reminders dispatched', { due: due.length, sent });
    return { due: due.length, sent };
  }

  // --- internals -----------------------------------------------------------

  /** @private */
  async _requirePatient(patientId) {
    const patient = await this.patients.findByIdOrThrow(patientId, 'Patient', {
      projection: 'user ward primaryDoctor assignedNurses medicalRecordNumber',
    });
    return patient;
  }

  /** @private the patient reads their own; everyone else needs the clinical tier. */
  _assertCanRead(patient, actor) {
    if (accessPolicy.isSelf(actor, patient)) return;
    if (accessPolicy.canReadCareData(actor)) return;
    throw ApiError.forbidden('You do not have access to this medical record');
  }

  /** @private */
  _assertDoctor(actor) {
    if (!actor || actor.role !== ROLES.DOCTOR) {
      throw ApiError.forbidden('Only a doctor can write an encounter record');
    }
  }

  /**
   * @private resolves catalogue links in one query and copies the canonical name
   * onto each line, so the printed prescription does not depend on the medicine
   * document still existing.
   */
  async _resolvePrescriptions(prescriptions) {
    if (!Array.isArray(prescriptions) || !prescriptions.length) return prescriptions || [];

    const ids = [...new Set(prescriptions.map((item) => item.medicine).filter(Boolean).map(String))];
    const catalogue = new Map();
    if (ids.length) {
      const found = await this.medicines.find(
        { _id: { $in: ids } },
        { projection: 'name', lean: true, limit: 100 }
      );
      found.forEach((medicine) => catalogue.set(String(medicine._id), medicine.name));

      const missing = ids.filter((id) => !catalogue.has(id));
      if (missing.length) {
        throw ApiError.badRequest('One or more prescribed medicines could not be found');
      }
    }

    return prescriptions.map((item) => {
      const name = item.medicine ? catalogue.get(String(item.medicine)) : item.name;
      if (!name) throw ApiError.badRequest('Every prescription line needs a medicine name');
      return {
        medicine: item.medicine,
        name,
        dosage: item.dosage,
        frequency: item.frequency,
        durationDays: item.durationDays,
        instructions: item.instructions,
      };
    });
  }

  /** @private the visit summary is written for the patient, so they are told it exists. */
  async _notifyPatient(patient, record) {
    if (!patient.user) return;
    await this.notifications.notify({
      recipient: patient.user,
      title: 'Visit summary available',
      message: 'Your doctor has recorded the notes from your visit.',
      type: NOTIFICATION_TYPE.CARE,
      data: { recordId: String(record._id) },
    });
  }
}

module.exports = new MedicalRecordService();
module.exports.MedicalRecordService = MedicalRecordService;
