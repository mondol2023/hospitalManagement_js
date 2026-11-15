'use strict';

const {
  careLogRepository,
  patientRepository,
  medicineRepository,
  stockMovementRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { withTransaction } = require('../utils/transaction');
const {
  ROLES,
  CLINICAL_ROLES,
  CARE_LOG_TYPE,
  MEDICATION_STATUS,
  STOCK_MOVEMENT,
  NOTIFICATION_TYPE,
  SOCKET_EVENTS,
} = require('../utils/constants');
const nurseService = require('./nurseService');
const notificationService = require('./notificationService');
const realtimeService = require('./realtimeService');

/** The bedside record — the feature the original system was missing entirely. */
class CareLogService {
  constructor({
    careLogs = careLogRepository,
    patients = patientRepository,
    medicines = medicineRepository,
    stockMovements = stockMovementRepository,
    nurses = nurseService,
    notifications = notificationService,
    realtime = realtimeService,
  } = {}) {
    this.careLogs = careLogs;
    this.patients = patients;
    this.medicines = medicines;
    this.stockMovements = stockMovements;
    this.nurses = nurses;
    this.notifications = notifications;
    this.realtime = realtime;
  }

  // --- Writes ---------------------------------------------------------------

  /**
   * Generic entry point. The typed helpers below build their payload and delegate here, so
   * authorisation, ward denormalisation, fan-out and flag handling exist exactly once.
   */
  async record(payload, actor, { skipAccessCheck = false, session } = {}) {
    const patient = await this._requirePatient(payload.patientId);
    if (!skipAccessCheck) await this._assertCanWrite(patient, actor);
    this._assertClinicalAuthor(actor);

    const doc = await this.careLogs.create(
      {
        patient: patient._id,
        // Denormalised at write time: the ward a log was written in is a
        // historical fact and must not change when the patient later moves.
        ward: payload.ward !== undefined ? payload.ward : patient.ward,
        bed: payload.bed !== undefined ? payload.bed : patient.bed || null,
        type: payload.type,
        recordedBy: actor.id,
        recordedByRole: actor.role,
        performedAt: payload.performedAt || new Date(),
        shift: payload.shift,
        medication: payload.medication,
        vitals: payload.vitals,
        service: payload.service,
        handover: payload.handover,
        notes: payload.notes,
        attachments: payload.attachments,
        requiresAttention: payload.requiresAttention || undefined,
      },
      { session }
    );

    const json = doc.toJSON();
    this._broadcast(patient, json);
    if (json.requiresAttention) await this._escalate(patient, json);

    return json;
  }

  /** Records a dose. */
  async administerMedication(payload, actor) {
    const {
      patientId,
      medicineId,
      name,
      dosage,
      route,
      status = MEDICATION_STATUS.ADMINISTERED,
      scheduledFor,
      medicalRecordId,
      reason,
      quantity = 1,
      notes,
    } = payload;

    const patient = await this._requirePatient(patientId);
    await this._assertCanWrite(patient, actor);
    this._assertClinicalAuthor(actor);

    const deducts = Boolean(medicineId) && status === MEDICATION_STATUS.ADMINISTERED;
    const units = Math.max(1, Number(quantity) || 1);

    let lowStock = null;
    const log = await withTransaction(async (session) => {
      let medicine = null;
      if (deducts) {
        medicine = await this.medicines.deductStock(medicineId, units, { session });
        if (!medicine) {
          throw ApiError.conflict('Insufficient stock for that medicine', {
            code: 'INSUFFICIENT_STOCK',
          });
        }
        await this.stockMovements.create(
          {
            medicine: medicineId,
            kind: STOCK_MOVEMENT.ADMINISTERED,
            delta: -units,
            onHand: medicine.quantity,
            actor: accessPolicy.toId(actor.id || actor._id),
          },
          { session }
        );
      }

      try {
        const log = await this.record(
          {
            patientId: patient._id,
            type: CARE_LOG_TYPE.MEDICATION,
            notes,
            medication: {
              medicine: medicineId,
              name: name || (medicine && medicine.name),
              dosage,
              route,
              status,
              scheduledFor,
              medicalRecord: medicalRecordId,
              reason,
              stockDeducted: deducts,
            },
          },
          actor,
          { skipAccessCheck: true, session }
        );

        if (medicine && medicine.quantity <= medicine.reorderLevel) lowStock = medicine;
        return log;
      } catch (error) {
        if (deducts && !session) await this._restoreStock(medicineId, units, actor);
        throw error;
      }
    });

    // After the commit, so a rolled-back dose never raises an alert.
    if (lowStock) await this.notifications.alertLowStock(lowStock);
    return log;
  }

  // Compensation for a failed chart entry; best effort, and the ledger says it happened.
  async _restoreStock(medicineId, units, actor) {
    try {
      const medicine = await this.medicines.restock(medicineId, units);
      await this.stockMovements.create({
        medicine: medicineId,
        kind: STOCK_MOVEMENT.RESTORED,
        delta: units,
        onHand: medicine.quantity,
        actor: accessPolicy.toId(actor.id || actor._id),
        reason: 'Care-log entry failed; dose not given',
      });
    } catch (error) {
      logger.error('Failed to restore stock after failed administration', {
        medicineId: String(medicineId),
        error: error.message,
      });
    }
  }

  /** Observations. Out-of-range readings are auto-flagged by the model. */
  recordVitals({ patientId, vitals, notes, performedAt }, actor) {
    return this.record(
      { patientId, type: CARE_LOG_TYPE.VITALS, vitals, notes, performedAt },
      actor
    );
  }

  /** A delivered nursing service — hygiene, mobility, wound care, and so on. */
  logService({ patientId, category, name, durationMinutes, chargeableCents, notes }, actor) {
    return this.record(
      {
        patientId,
        type: CARE_LOG_TYPE.SERVICE,
        notes,
        service: { category, name, durationMinutes, chargeableCents },
      },
      actor
    );
  }

  logProcedure({ patientId, category, name, durationMinutes, chargeableCents, notes }, actor) {
    return this.record(
      {
        patientId,
        type: CARE_LOG_TYPE.PROCEDURE,
        notes,
        service: { category, name, durationMinutes, chargeableCents },
      },
      actor
    );
  }

  /** Free-text clinical note. `requiresAttention` lets a nurse escalate manually. */
  logObservation({ patientId, notes, requiresAttention }, actor) {
    return this.record(
      { patientId, type: CARE_LOG_TYPE.OBSERVATION, notes, requiresAttention },
      actor
    );
  }

  /**
   * Shift handover. The incoming nurse is notified directly rather than being
   * expected to notice a new row in the feed.
   */
  async handover({ patientId, toNurseUserId, summary, outstandingTasks }, actor) {
    if (!toNurseUserId) throw ApiError.badRequest('A receiving nurse is required');

    const log = await this.record(
      {
        patientId,
        type: CARE_LOG_TYPE.HANDOVER,
        notes: summary,
        handover: { toNurse: toNurseUserId, summary, outstandingTasks },
      },
      actor
    );

    await this.notifications.notify({
      recipient: toNurseUserId,
      title: 'Shift handover received',
      message: summary,
      type: NOTIFICATION_TYPE.CARE,
      data: { careLogId: String(log.id || log._id), patientId: String(patientId) },
    });
    return log;
  }

  // --- Reads ----------------------------------------------------------------

  /** The patient's chronological bedside timeline. */
  async timeline(patientId, actor, query = {}) {
    this._assertCanRead(actor);
    const patient = await this._requirePatient(patientId);
    return this.careLogs.timelineFor(patient._id, query);
  }

  /** The nurses' station ward feed. */
  wardFeed(ward, actor, query = {}) {
    this._assertCanRead(actor);
    if (!ward) throw ApiError.badRequest('A ward is required');
    return this.careLogs.wardFeed(ward, query);
  }

  /** "What have I recorded this shift?" */
  myEntries(actor, query = {}) {
    this._assertCanRead(actor);
    return this.careLogs.recordedByUser(actor.id, query);
  }

  /** The review queue: flagged entries nobody has picked up. */
  attentionQueue(actor, { ward } = {}, query = {}) {
    this._assertCanRead(actor);
    return this.careLogs.attentionQueue({ ward }, query);
  }

  countUnacknowledged(actor, ward) {
    this._assertCanRead(actor);
    return this.careLogs.countUnacknowledged(ward);
  }

  async latestVitals(patientId, actor) {
    this._assertCanRead(actor);
    const patient = await this._requirePatient(patientId);
    return this.careLogs.latestVitals(patient._id);
  }

  async getById(careLogId, actor) {
    this._assertCanRead(actor);
    const log = await this.careLogs.findByIdOrThrow(careLogId, 'Care log', {
      populate: [
        { path: 'recordedBy', select: 'name role' },
        { path: 'patient', select: 'medicalRecordNumber ward user' },
      ],
    });
    return log;
  }

  // --- Acting on flagged entries -------------------------------------------

  /** Clears a flagged entry. */
  async acknowledge(careLogId, actor, note) {
    if (!accessPolicy.canReadCareData(actor)) {
      throw ApiError.forbidden('Only clinicians can acknowledge a care entry');
    }

    const updated = await this.careLogs.updateOne(
      { _id: careLogId, requiresAttention: true, acknowledgedAt: null },
      {
        $set: {
          acknowledgedBy: actor.id,
          acknowledgedAt: new Date(),
          acknowledgementNote: note,
        },
      }
    );
    if (!updated) {
      throw ApiError.conflict('That entry is not awaiting acknowledgement', {
        code: 'ALREADY_ACKNOWLEDGED',
      });
    }
    return updated;
  }

  /** Corrects an entry by superseding it. */
  async correct(careLogId, payload, actor) {
    const original = await this.careLogs.findByIdOrThrow(careLogId, 'Care log');
    if (original.supersededBy) {
      throw ApiError.conflict('That entry has already been corrected');
    }

    const patient = await this._requirePatient(original.patient);
    await this._assertCanWrite(patient, actor);

    const replacement = await this.record(
      {
        ...payload,
        patientId: patient._id,
        type: payload.type || original.type,
        performedAt: original.performedAt,
      },
      actor,
      { skipAccessCheck: true }
    );

    await this.careLogs.updateById(careLogId, {
      $set: { supersededBy: replacement.id || replacement._id },
    });
    logger.info('Care log corrected', {
      careLogId: String(careLogId),
      by: String(actor.id),
    });
    return replacement;
  }

  // --- internals -----------------------------------------------------------

  /** @private */
  async _requirePatient(patientId) {
    const patient = await this.patients.findByIdOrThrow(patientId, 'Patient', {
      projection: 'user ward bed primaryDoctor assignedNurses medicalRecordNumber',
    });
    return patient;
  }

  /** @private clinical read tier. */
  _assertCanRead(actor) {
    if (!accessPolicy.canReadCareData(actor)) {
      throw ApiError.forbidden('Care records are visible to clinical staff only');
    }
  }

  /**
   * @private clinical write tier. Ward coverage is only loaded for nurses, so a
   * doctor's write costs no extra query.
   */
  async _assertCanWrite(patient, actor) {
    const wards = actor.role === ROLES.NURSE ? await this.nurses.coveredWards(actor.id) : undefined;
    if (!accessPolicy.canWriteCareData({ actor, patient, wards })) {
      throw ApiError.forbidden('You are not on this patient’s care team');
    }
  }

  /**
   * @private the schema requires an author with a clinical role, because a
   * bedside entry attributed to an accountant is not a bedside entry. Checked
   * here so the failure is a clear 403 rather than a schema validation error.
   */
  _assertClinicalAuthor(actor) {
    accessPolicy.assertRole(actor, CLINICAL_ROLES, 'Only doctors and nurses can write to a care record');
  }

  /** @private staff-only fan-out: the care room, then the ward's station board. */
  _broadcast(patient, log) {
    this.realtime.toPatientCare(patient._id, SOCKET_EVENTS.CARE_LOG_NEW, log);
    if (patient.ward) {
      this.realtime.toRole(ROLES.NURSE, SOCKET_EVENTS.CARE_LOG_NEW, {
        ward: patient.ward,
        log,
      });
    }
  }

  /**
   * @private a flagged entry pages the care team rather than waiting to be found.
   * Best-effort: the observation is already durably recorded, and failing the
   * nurse's save because a push failed would discourage recording at all.
   */
  async _escalate(patient, log) {
    this.realtime.toPatientCare(patient._id, SOCKET_EVENTS.CARE_LOG_FLAGGED, log);

    const recipients = accessPolicy.careTeamIds(patient);
    if (!recipients.length) return;

    try {
      await this.notifications.notifyMany(recipients, {
        title: 'Patient needs review',
        message: `A ${log.type} entry for ${patient.medicalRecordNumber} needs clinical review.`,
        type: NOTIFICATION_TYPE.CARE,
        data: { careLogId: String(log.id || log._id), patientId: String(patient._id) },
      });
    } catch (error) {
      logger.error('Failed to escalate flagged care log', { error: error.message });
    }
  }
}

module.exports = new CareLogService();
module.exports.CareLogService = CareLogService;
