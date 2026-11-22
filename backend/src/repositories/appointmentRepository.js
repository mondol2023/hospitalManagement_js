'use strict';

const BaseRepository = require('./BaseRepository');
const { Appointment } = require('../models');
const { APPOINTMENT_STATUS } = require('../utils/constants');

/** Statuses that still occupy a slot in the doctor's calendar. */
const LIVE_STATUSES = [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED];

/** Visits that happened, one way or the other — still part of the day's work. */
const CLOSED_STATUSES = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW];

class AppointmentRepository extends BaseRepository {
  constructor() {
    super(Appointment, {
      sortableFields: ['scheduledAt', 'status'],
      defaultSort: { scheduledAt: -1 },
    });
  }

  /** Exposed so services can reuse the same definition of "occupies a slot". */
  get liveStatuses() {
    return LIVE_STATUSES;
  }

  /**
   * Detects a clash for a doctor over `[startsAt, endsAt)`.
   *
   * Two intervals overlap when each starts before the other ends; expressing it
   * that way keeps this a pure index range scan on `{ doctor, scheduledAt }`.
   * `excludeId` lets a reschedule ignore the appointment being moved.
   */
  findConflict({ doctor, startsAt, endsAt, excludeId }) {
    const filter = {
      doctor,
      status: { $in: LIVE_STATUSES },
      scheduledAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return this.findOne(filter, { projection: { scheduledAt: 1, endsAt: 1, status: 1 } });
  }

  /**
   * Live appointments on a doctor's calendar for one day, in time order. Bare
   * patient ids — this feeds the free-slot calculation, not a screen.
   */
  dayScheduleFor(doctor, dayStart, dayEnd) {
    return this.model
      .find({ doctor, scheduledAt: { $gte: dayStart, $lt: dayEnd }, status: { $in: LIVE_STATUSES } })
      .select('patient scheduledAt endsAt durationMinutes status reason')
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();
  }

  /**
   * The doctor's day as a screen shows it: the patient's MRN and name on every
   * row. `includeClosed` adds completed and no-show visits so finished work stays
   * on the day; cancelled visits never appear.
   */
  dayAgendaFor(doctor, dayStart, dayEnd, { includeClosed = false } = {}) {
    const statuses = includeClosed ? [...LIVE_STATUSES, ...CLOSED_STATUSES] : LIVE_STATUSES;
    return this.model
      .find({ doctor, scheduledAt: { $gte: dayStart, $lt: dayEnd }, status: { $in: statuses } })
      .select('patient scheduledAt endsAt durationMinutes status reason')
      .populate({
        path: 'patient',
        select: 'medicalRecordNumber user',
        populate: { path: 'user', select: 'name' },
      })
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();
  }

  /**
   * A patient's appointments. `status`, `doctor`, and `from`/`to` (on
   * `scheduledAt`, `from` inclusive, `to` exclusive) narrow the list.
   *
   * `upcoming` is "what is still ahead of me": live statuses from now on, soonest
   * first. It overrides `status` and `sort` — a past visit still marked `pending`
   * is a stale row, never "my next appointment".
   */
  listForPatient(patientId, query = {}) {
    const filter = { patient: patientId };
    if (query.doctor) filter.doctor = query.doctor;

    const range = {};
    if (query.from) range.$gte = query.from;
    if (query.to) range.$lt = query.to;

    let listQuery = query;
    if (query.upcoming) {
      filter.status = { $in: LIVE_STATUSES };
      range.$gte = new Date(Math.max(Date.now(), range.$gte ? new Date(range.$gte) : 0));
      listQuery = { ...query, sort: 'scheduledAt' };
    } else if (query.status) {
      filter.status = query.status;
    }
    if (Object.keys(range).length) filter.scheduledAt = range;

    return this.paginate(filter, listQuery, {
      populate: { path: 'doctor', select: 'name email' },
    });
  }

  listForDoctor(doctorUserId, query = {}) {
    const filter = { doctor: doctorUserId };
    if (query.status) filter.status = query.status;
    return this.paginate(filter, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber user ward' },
    });
  }

  /** Reminder sweep: live appointments starting inside the window. */
  dueForReminder(from, to) {
    return this.model
      .find({ scheduledAt: { $gte: from, $lt: to }, status: APPOINTMENT_STATUS.CONFIRMED })
      .select('patient doctor scheduledAt')
      .lean()
      .exec();
  }
}

module.exports = new AppointmentRepository();
