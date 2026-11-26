'use strict';

const { doctorRepository, appointmentRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const cacheService = require('./cacheService');
const rosterScope = require('../utils/rosterScope');

const CACHE_PREFIX = 'doctors';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The doctor directory and the availability calculation behind it. */
class DoctorService {
  constructor({
    doctors = doctorRepository,
    appointments = appointmentRepository,
    cache = cacheService,
  } = {}) {
    this.doctors = doctors;
    this.appointments = appointments;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
  }

  /**
   * "Find a doctor" listing. Cached — it is read constantly, written rarely.
   *
   * Everyone gets active doctors who are taking patients. An administrator may
   * ask for `status` and `accepting` to see the whole roster. The cache key
   * carries the scope and both effective values: without them an
   * administrator's `status=all` page would be served to a patient who sent the
   * same query string.
   */
  async list(query = {}, actor) {
    const scope = rosterScope(query, actor);
    const filter = { ...this.doctors.searchFilter(query.search) };
    if (query.specialization) filter.specialization = query.specialization;
    if (query.department) filter.department = query.department;

    const key = this.ns.key('list', {
      scope: scope.admin ? 'admin' : 'public',
      status: scope.status,
      accepting: scope.accepting,
      specialization: query.specialization,
      department: query.department,
      search: query.search,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return this.cache.wrap(key, () => {
      if (!scope.admin) return this.doctors.listAvailable(filter, query);

      if (scope.isActive !== undefined) filter.isActive = scope.isActive;
      if (scope.accepting !== undefined) filter.isAcceptingPatients = scope.accepting;
      return this.doctors.listForAdmin(filter, query);
    });
  }

  async getById(doctorProfileId) {
    const doctor = await this.doctors.findByIdOrThrow(doctorProfileId, 'Doctor', {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
    return doctor;
  }

  async getByUser(userId) {
    const doctor = await this.doctors.findByUser(userId, {
      populate: { path: 'user', select: 'name email phone profilePic' },
    });
    if (!doctor) throw ApiError.notFound('Doctor profile');
    return doctor;
  }

  /** Distinct specialisations, for the directory filter. Long TTL: this set barely moves. */
  specializations() {
    return this.cache.wrap(
      this.ns.key('specializations'),
      () => this.doctors.specializations(),
      900
    );
  }

  /** A doctor editing their own profile. Role and employment fields are not touchable here. */
  async updateOwnProfile(userId, patch = {}) {
    const allowed = [
      'specialization',
      'qualifications',
      'licenseNumber',
      'experienceInYears',
      'consultationFeeCents',
      'availableDays',
      'timeSlots',
      'slotDurationMinutes',
      'isAcceptingPatients',
      'department',
      'shift',
    ];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const doctor = await this.doctors.updateOne({ user: userId }, { $set: update });
    if (!doctor) throw ApiError.notFound('Doctor profile');

    await this.ns.invalidate();
    return doctor;
  }

  /**
   * An administrator setting where a doctor works and whether they take new
   * patients. Only these three fields are copied: clinical fields belong to the
   * doctor (`updateOwnProfile`).
   */
  async updateEmployment(doctorProfileId, patch = {}) {
    const update = {};
    for (const field of ['department', 'shift', 'isAcceptingPatients']) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }

    const updated = await this.doctors.updateById(doctorProfileId, { $set: update });
    if (!updated) throw ApiError.notFound('Doctor');

    // The directory and the specialisation list are cached.
    await this.ns.invalidate();
    logger.info('Doctor employment updated', { doctorProfileId: String(doctorProfileId) });

    // Same shape as `GET /doctors/:id`, with the account details populated.
    return this.getById(doctorProfileId);
  }

  async setDuty(userId, isOnDuty) {
    const doctor = await this.doctors.updateOne({ user: userId }, { $set: { isOnDuty } });
    if (!doctor) throw ApiError.notFound('Doctor profile');
    await this.ns.invalidate();
    return doctor;
  }

  /** Free slots for one doctor on one day. */
  async availability(doctorUserId, date) {
    const doctor = await this.doctors.findDocByUser(doctorUserId);
    if (!doctor) throw ApiError.notFound('Doctor profile');

    const dayStart = startOfUtcDay(date);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    if (!doctor.isAcceptingPatients || !doctor.isActive || !doctor.worksOn(dayStart)) {
      return { date: dayStart, slotDurationMinutes: doctor.slotDurationMinutes, slots: [] };
    }

    const booked = await this.appointments.dayScheduleFor(doctorUserId, dayStart, dayEnd);
    const now = Date.now();

    const slots = this._generateSlots(doctor, dayStart)
      // A slot in the past is not bookable, which the old code never checked —
      // patients could book yesterday.
      .filter((slot) => slot.startsAt.getTime() > now)
      .map((slot) => ({
        ...slot,
        available: !booked.some(
          (appointment) =>
            new Date(appointment.scheduledAt) < slot.endsAt &&
            new Date(appointment.endsAt) > slot.startsAt
        ),
      }));

    return {
      date: dayStart,
      slotDurationMinutes: doctor.slotDurationMinutes,
      slots: slots.filter((slot) => slot.available),
    };
  }

  /**
   * @private walks each configured window in `slotDurationMinutes` steps.
   * A doctor with no configured windows is treated as unavailable rather than
   * always-available: silently inventing office hours is worse than showing none.
   */
  _generateSlots(doctor, dayStart) {
    const windows = doctor.timeSlots || [];
    const step = (doctor.slotDurationMinutes || 30) * 60_000;
    const slots = [];

    for (const window of windows) {
      const from = dayStart.getTime() + toMinutes(window.start) * 60_000;
      const until = dayStart.getTime() + toMinutes(window.end) * 60_000;
      for (let cursor = from; cursor + step <= until; cursor += step) {
        slots.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + step) });
      }
    }
    return slots;
  }
}

/** Days are bucketed in UTC so a server timezone change cannot shift the calendar. */
function startOfUtcDay(date) {
  const value = date ? new Date(date) : new Date();
  if (Number.isNaN(value.getTime())) throw ApiError.badRequest('Invalid date');
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  return hours * 60 + minutes;
}

module.exports = new DoctorService();
module.exports.DoctorService = DoctorService;
module.exports.startOfUtcDay = startOfUtcDay;
