'use strict';

const {
  appointmentRepository,
  patientRepository,
  userRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const {
  ROLES,
  APPOINTMENT_STATUS,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
} = require('../utils/constants');
const doctorService = require('./doctorService');
const notificationService = require('./notificationService');

const DUPLICATE_KEY = 11000;

/**
 * Booking and the appointment lifecycle.
 *
 * Double-booking is defended at three depths, deliberately:
 *
 *  1. the requested slot must be one `doctorService.availability` actually offers,
 *     so a client cannot invent a time outside the doctor's working pattern;
 *  2. an overlap query rejects the common case with a clear 409;
 *  3. the partial unique index `uniq_doctor_slot_active` is the final authority —
 *     two requests that pass (2) in the same millisecond cannot both commit, and
 *     the loser's duplicate-key error is translated into the same 409.
 *
 * Layer (3) is the one that actually holds under load; (1) and (2) exist to give
 * a useful error rather than a database code. The original implementation had
 * only a read-then-write check, which is exactly the shape that fails under
 * concurrency.
 *
 * Status changes go through `Appointment.isValidTransition`, so "cancel a
 * completed visit" is impossible from any entry point rather than from whichever
 * controller remembered to check.
 */
class AppointmentService {
  constructor({
    appointments = appointmentRepository,
    patients = patientRepository,
    users = userRepository,
    doctors = doctorService,
    notifications = notificationService,
  } = {}) {
    this.appointments = appointments;
    this.patients = patients;
    this.users = users;
    this.doctors = doctors;
    this.notifications = notifications;
  }

  /**
   * @param {object} payload
   * @param {string} [payload.patientId] required unless the actor is the patient
   * @param {string} payload.doctorUserId the doctor's *user* id
   * @param {string|Date} payload.scheduledAt
   * @param {number} [payload.durationMinutes]
   * @param {object} actor `req.user`
   */
  async book({ patientId, doctorUserId, scheduledAt, durationMinutes, reason }, actor) {
    const patient = await this._resolvePatient(actor, patientId);
    const doctor = await this._requireActiveDoctor(doctorUserId);

    const startsAt = new Date(scheduledAt);
    if (Number.isNaN(startsAt.getTime())) throw ApiError.badRequest('Invalid appointment time');
    if (startsAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('Appointments cannot be booked in the past');
    }

    const duration = Number(durationMinutes) || 30;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    await this._assertSlotIsOffered(doctorUserId, startsAt, endsAt);

    const clash = await this.appointments.findConflict({
      doctor: doctorUserId,
      startsAt,
      endsAt,
    });
    if (clash) throw ApiError.conflict('That slot has just been taken', { code: 'SLOT_TAKEN' });

    await this._assertPatientIsFree(patient._id, startsAt, endsAt);

    const appointment = await this._create({
      patient: patient._id,
      doctor: doctorUserId,
      scheduledAt: startsAt,
      durationMinutes: duration,
      reason,
      createdBy: actor.id,
      // A patient's own request starts pending; staff booking on the desk is
      // already an agreed slot.
      status: actor.role === ROLES.PATIENT ? APPOINTMENT_STATUS.PENDING : APPOINTMENT_STATUS.CONFIRMED,
    });

    await this._announce(appointment, patient, doctor, {
      title: 'Appointment booked',
      message: `Appointment with Dr ${doctor.name} on ${startsAt.toUTCString()}.`,
    });

    logger.info('Appointment booked', {
      appointmentId: String(appointment._id),
      doctor: String(doctorUserId),
    });
    return appointment;
  }

  async getById(appointmentId, actor) {
    const appointment = await this.appointments.findById(appointmentId, {
      populate: [
        { path: 'doctor', select: 'name email' },
        { path: 'patient', select: 'medicalRecordNumber user ward' },
      ],
    });
    if (!appointment) throw ApiError.notFound('Appointment');
    await this._assertVisible(appointment, actor);
    return appointment;
  }

  /** "My appointments", whichever side of the consultation the caller is on. */
  async listMine(actor, query = {}) {
    if (actor.role === ROLES.PATIENT) {
      const patient = await this._resolvePatient(actor);
      return this.appointments.listForPatient(patient._id, query);
    }
    if (actor.role === ROLES.DOCTOR) {
      return this.appointments.listForDoctor(actor.id, query);
    }
    return this.appointments.paginate(this._staffFilter(query), query, {
      populate: [
        { path: 'doctor', select: 'name' },
        { path: 'patient', select: 'medicalRecordNumber user' },
      ],
    });
  }

  async listForPatient(patientId, actor, query = {}) {
    const patient = await this._resolvePatient(actor, patientId);
    return this.appointments.listForPatient(patient._id, query);
  }

  listForDoctor(doctorUserId, query = {}) {
    return this.appointments.listForDoctor(doctorUserId, query);
  }

  /** The doctor's day view — used by the consultation screen. */
  daySchedule(doctorUserId, date) {
    const dayStart = doctorService.startOfUtcDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    return this.appointments.dayScheduleFor(doctorUserId, dayStart, dayEnd);
  }

  /**
   * Moves an appointment. Re-runs every booking check against the new time, so a
   * reschedule cannot land somewhere a fresh booking would have been refused.
   */
  async reschedule(appointmentId, { scheduledAt, durationMinutes }, actor) {
    const appointment = await this.appointments.findDocById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment');
    await this._assertVisible(appointment, actor);

    if (![APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED].includes(appointment.status)) {
      throw ApiError.conflict(`A ${appointment.status} appointment cannot be rescheduled`);
    }

    const startsAt = new Date(scheduledAt);
    if (Number.isNaN(startsAt.getTime())) throw ApiError.badRequest('Invalid appointment time');
    if (startsAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('Appointments cannot be moved into the past');
    }

    const duration = Number(durationMinutes) || appointment.durationMinutes;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const doctorUserId = String(appointment.doctor);

    await this._assertSlotIsOffered(doctorUserId, startsAt, endsAt);

    const clash = await this.appointments.findConflict({
      doctor: doctorUserId,
      startsAt,
      endsAt,
      excludeId: appointment._id,
    });
    if (clash) throw ApiError.conflict('That slot has just been taken', { code: 'SLOT_TAKEN' });

    appointment.scheduledAt = startsAt;
    appointment.durationMinutes = duration;

    const saved = await this._save(appointment);
    await this._notifyParties(saved, {
      title: 'Appointment rescheduled',
      message: `Your appointment has moved to ${startsAt.toUTCString()}.`,
    });
    return saved.toJSON();
  }

  /**
   * The single status-change entry point. Every named helper below funnels here,
   * so the transition table is consulted exactly once.
   */
  async transition(appointmentId, nextStatus, actor, { reason } = {}) {
    const appointment = await this.appointments.findDocById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment');
    await this._assertVisible(appointment, actor);

    if (!appointment.canTransitionTo(nextStatus)) {
      throw ApiError.conflict(
        `An appointment cannot move from ${appointment.status} to ${nextStatus}`,
        { code: 'INVALID_TRANSITION' }
      );
    }

    // Outcome statuses are a clinical judgement, not something the patient may
    // assert about their own visit.
    const clinicalOnly = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW];
    if (clinicalOnly.includes(nextStatus) && actor.role === ROLES.PATIENT) {
      throw ApiError.forbidden('Only staff can close an appointment');
    }
    if (nextStatus === APPOINTMENT_STATUS.CONFIRMED && actor.role === ROLES.PATIENT) {
      throw ApiError.forbidden('Only staff can confirm an appointment');
    }

    appointment.status = nextStatus;
    if (nextStatus === APPOINTMENT_STATUS.CANCELLED) {
      appointment.cancelledBy = actor.id;
      appointment.cancellationReason = reason;
    }

    const saved = await this._save(appointment);
    await this._notifyParties(saved, {
      title: `Appointment ${nextStatus}`,
      message: reason
        ? `Your appointment is now ${nextStatus}: ${reason}`
        : `Your appointment is now ${nextStatus}.`,
    });

    logger.info('Appointment status changed', {
      appointmentId: String(appointment._id),
      status: nextStatus,
    });
    return saved.toJSON();
  }

  confirm(appointmentId, actor) {
    return this.transition(appointmentId, APPOINTMENT_STATUS.CONFIRMED, actor);
  }

  cancel(appointmentId, actor, reason) {
    return this.transition(appointmentId, APPOINTMENT_STATUS.CANCELLED, actor, { reason });
  }

  complete(appointmentId, actor, notes) {
    return this.transition(appointmentId, APPOINTMENT_STATUS.COMPLETED, actor, { reason: notes });
  }

  markNoShow(appointmentId, actor) {
    return this.transition(appointmentId, APPOINTMENT_STATUS.NO_SHOW, actor);
  }

  /**
   * Reminder sweep, called by the scheduled job. Returns how many were sent so
   * the job can log a useful number rather than "done".
   */
  async sendReminders({ fromMinutes = 0, toMinutes = 60 } = {}) {
    const now = Date.now();
    const from = new Date(now + fromMinutes * 60_000);
    const to = new Date(now + toMinutes * 60_000);

    const due = await this.appointments.dueForReminder(from, to);
    let sent = 0;

    for (const appointment of due) {
      const patient = await this.patients.findById(appointment.patient, { projection: 'user' });
      if (!patient) continue;
      await this.notifications.notify({
        recipient: patient.user,
        title: 'Appointment reminder',
        message: `You have an appointment at ${new Date(appointment.scheduledAt).toUTCString()}.`,
        type: NOTIFICATION_TYPE.APPOINTMENT,
        channels: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.EMAIL],
        data: { appointmentId: String(appointment._id) },
      });
      sent += 1;
    }

    if (sent) logger.info('Appointment reminders sent', { sent });
    return { sent, considered: due.length };
  }

  // --- internals -----------------------------------------------------------

  /** @private translates the unique-index race into the same 409 as the soft check. */
  async _create(payload) {
    try {
      const created = await this.appointments.create(payload);
      return created.toJSON();
    } catch (error) {
      if (error.code === DUPLICATE_KEY) {
        throw ApiError.conflict('That slot has just been taken', { code: 'SLOT_TAKEN' });
      }
      throw error;
    }
  }

  /** @private same translation for the document-save path. */
  async _save(doc) {
    try {
      return await doc.save();
    } catch (error) {
      if (error.code === DUPLICATE_KEY) {
        throw ApiError.conflict('That slot has just been taken', { code: 'SLOT_TAKEN' });
      }
      throw error;
    }
  }

  /**
   * @private the requested time must be a slot the doctor actually publishes.
   * Without this a client could post any timestamp and book outside clinic hours.
   */
  async _assertSlotIsOffered(doctorUserId, startsAt, endsAt) {
    const { slots } = await this.doctors.availability(doctorUserId, startsAt);
    const offered = slots.some(
      (slot) =>
        new Date(slot.startsAt).getTime() === startsAt.getTime() &&
        new Date(slot.endsAt).getTime() >= endsAt.getTime()
    );
    if (!offered) {
      throw ApiError.conflict('That time is not available for this doctor', {
        code: 'SLOT_UNAVAILABLE',
      });
    }
  }

  /** @private a patient cannot be in two consultations at once either. */
  async _assertPatientIsFree(patientId, startsAt, endsAt) {
    const overlap = await this.appointments.findOne(
      {
        patient: patientId,
        status: { $in: this.appointments.liveStatuses },
        scheduledAt: { $lt: endsAt },
        endsAt: { $gt: startsAt },
      },
      { projection: '_id' }
    );
    if (overlap) {
      throw ApiError.conflict('This patient already has an appointment at that time', {
        code: 'PATIENT_DOUBLE_BOOKED',
      });
    }
  }

  /** @private */
  async _resolvePatient(actor, patientId) {
    if (actor.role === ROLES.PATIENT) {
      const own = await this.patients.findByUser(actor.id, { projection: '_id user' });
      if (!own) throw ApiError.notFound('Patient profile');
      return own;
    }
    if (!patientId) throw ApiError.badRequest('A patient id is required');
    const patient = await this.patients.findById(patientId, { projection: '_id user' });
    if (!patient) throw ApiError.notFound('Patient');
    return patient;
  }

  /** @private */
  async _requireActiveDoctor(doctorUserId) {
    const doctor = await this.users.findOne(
      { _id: doctorUserId, role: ROLES.DOCTOR, isActive: true },
      { projection: 'name email' }
    );
    if (!doctor) throw ApiError.badRequest('That id does not belong to an active doctor');
    return doctor;
  }

  /**
   * @private staff may see any appointment (front desk needs to); a patient may
   * see only their own.
   */
  async _assertVisible(appointment, actor) {
    if (accessPolicy.isStaff(actor.role)) return;
    const own = await this.patients.findByUser(actor.id, { projection: '_id' });
    const patientId = accessPolicy.toId(appointment.patient);
    if (!own || String(own._id) !== patientId) {
      throw ApiError.forbidden('You do not have access to this appointment');
    }
  }

  /** @private */
  _staffFilter(query) {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.doctor) filter.doctor = query.doctor;
    if (query.from || query.to) {
      filter.scheduledAt = {};
      if (query.from) filter.scheduledAt.$gte = new Date(query.from);
      if (query.to) filter.scheduledAt.$lte = new Date(query.to);
    }
    return filter;
  }

  /** @private booking notice, where both parties are already loaded. */
  _announce(appointment, patient, doctor, { title, message }) {
    return this.notifications.notifyMany([patient.user, doctor._id], {
      title,
      message,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      channels: [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.EMAIL],
      data: { appointmentId: String(appointment._id || appointment.id) },
    });
  }

  /** @private lifecycle notice, where the patient's user id must be looked up. */
  async _notifyParties(appointment, { title, message }) {
    const patient = await this.patients.findById(appointment.patient, { projection: 'user' });
    const recipients = [patient && patient.user, appointment.doctor].filter(Boolean);
    if (!recipients.length) return;
    await this.notifications.notifyMany(recipients, {
      title,
      message,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      data: { appointmentId: String(appointment._id) },
    });
  }
}

module.exports = new AppointmentService();
module.exports.AppointmentService = AppointmentService;
