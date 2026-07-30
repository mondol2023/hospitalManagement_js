'use strict';

const {
  medicalRecordRepository,
  patientRepository,
  medicineRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { ROLES, NOTIFICATION_TYPE } = require('../utils/constants');
const notificationService = require('./notificationService');

/**
 * The clinical encounter record — diagnosis, treatment plan, prescriptions.
 *
 * The model existed in the original codebase with no service, no controller and
 * no route: declared, indexed, and unreachable. This is the layer that makes it
 * a feature.
 *
 * Visibility differs from the nursing feed on purpose. `CareLog` is a staff
 * channel — a patient never reads their own observation stream, because raw
 * flagged vitals without a clinician's interpretation are alarming and useless.
 * The encounter record is the opposite: it is the document written *for* the
 * patient as much as for the chart, so they can read their own, and only their
 * own. Everyone else needs the clinical read tier; being an employee is not
 * enough, because a receptionist has no business reading a diagnosis.
 *
 * Authorship is a doctor. Not "a clinician" — a nurse's contribution to the
 * record is the care log, and the two must not blur, since the encounter record
 * is what discharge summaries and insurance claims are built from.
 */
class MedicalRecordService {
  constructor({
    records = medicalRecordRepository,
    patients = patientRepository,
    medicines = medicineRepository,
    notifications = notificationService,
  } = {}) {
    this.records = records;
    this.patients = patients;
    this.medicines = medicines;
    this.notifications = notifications;
  }

  // --- Reads ----------------------------------------------------------------

  /**
   * A patient's chart, most recent visit first.
   *
   * The patient themselves is allowed through; every other reader must clear the
   * clinical tier.
   */
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
    const record = await this.records.findById(recordId, {
      populate: [
        { path: 'doctor', select: 'name email' },
        { path: 'patient', select: 'medicalRecordNumber ward user' },
      ],
    });
    if (!record) throw ApiError.notFound('Medical record');

    this._assertCanRead(record.patient, actor);
    return record;
  }

  /** The latest encounter — what the ward round opens with. */
  async latest(patientId, actor) {
    const patient = await this._requirePatient(patientId);
    this._assertCanRead(patient, actor);
    return this.records.latestFor(patient._id);
  }

  // --- Writes ---------------------------------------------------------------

  /**
   * Records an encounter.
   *
   * Prescriptions are structured rather than a free-text blob — the original
   * schema had them as one string, which meant the pharmacy module could never
   * act on them. Where a line item is linked to inventory the medicine's real
   * name is copied in, so the record still reads correctly if the catalogue entry
   * is later renamed or retired.
   */
  async create(payload = {}, actor) {
    this._assertDoctor(actor);
    const patient = await this._requirePatient(payload.patientId);

    if (!payload.diagnosis) throw ApiError.badRequest('A diagnosis is required');

    const prescriptions = await this._resolvePrescriptions(payload.prescriptions);

    const record = await this.records.create({
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
   * Amends an encounter.
   *
   * The authoring doctor only — not their colleagues, not an administrator. A
   * record is a signed clinical opinion, and letting a third party edit it while
   * the signature stays the same is how charts stop being evidence.
   *
   * `patient` and `doctor` are absent from the whitelist: moving a record to a
   * different patient is never a correction, it is a new record.
   */
  async update(recordId, patch = {}, actor) {
    const record = await this.records.findById(recordId, { projection: 'doctor patient' });
    if (!record) throw ApiError.notFound('Medical record');
    if (String(record.doctor) !== String(actor.id || actor._id)) {
      throw ApiError.forbidden('Only the authoring doctor can amend this record');
    }

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
   * Follow-ups falling due in the next `days`.
   *
   * Returned rather than acted on, so the caller — a scheduled sweep — decides
   * what to do with them. Keeping the query and the reminder separate is what
   * makes this testable without a clock.
   */
  followUpsDue({ days = 1 } = {}) {
    const from = new Date();
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    return this.records.followUpsDue(from, to);
  }

  /**
   * Reminds patients whose follow-up falls in the window.
   *
   * Best-effort per patient: one bad recipient must not stop the rest of the
   * sweep, so failures are logged and counted rather than thrown.
   */
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
    const patient = await this.patients.findById(patientId, {
      projection: 'user ward primaryDoctor assignedNurses medicalRecordNumber',
    });
    if (!patient) throw ApiError.notFound('Patient');
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
