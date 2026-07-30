'use strict';

const BaseRepository = require('./BaseRepository');
const { Appointment } = require('../models');
const { APPOINTMENT_STATUS } = require('../utils/constants');

/** Statuses that still occupy a slot in the doctor's calendar. */
const LIVE_STATUSES = [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED];

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

  /** Everything on a doctor's calendar for one day, in time order. */
  dayScheduleFor(doctor, dayStart, dayEnd) {
    return this.model
      .find({ doctor, scheduledAt: { $gte: dayStart, $lt: dayEnd }, status: { $in: LIVE_STATUSES } })
      .select('patient scheduledAt endsAt durationMinutes status reason')
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();
  }

  listForPatient(patientId, query = {}) {
    return this.paginate({ patient: patientId }, query, {
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
