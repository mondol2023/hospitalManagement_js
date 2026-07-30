'use strict';

const { emergencyRepository, patientRepository, userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const {
  ROLES,
  STAFF_ROLES,
  CLINICAL_ROLES,
  EMERGENCY_STATUS,
  EMERGENCY_TYPE,
  EMERGENCY_SEVERITY,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  SOCKET_EVENTS,
} = require('../utils/constants');
const realtimeService = require('./realtimeService');
const notificationService = require('./notificationService');

/** Severities that page people out of band rather than waiting to be seen. */
const PAGING_SEVERITIES = Object.freeze([EMERGENCY_SEVERITY.HIGH, EMERGENCY_SEVERITY.CRITICAL]);
/** A hard ceiling on the fan-out, so a fire alert cannot become a mail storm. */
const MAX_RESPONDERS = 200;

/**
 * The alert channel.
 *
 * Two things make this service different from every other one in the codebase.
 *
 * **Latency is the feature.** The socket broadcast goes out before anything else
 * that can be deferred, because the difference between a crash call reaching the
 * ward screen in 50ms and in 2s is the whole point of the collection. Email and
 * SMS fan-out is detached — it is slow, it can fail, and nobody should wait on it.
 *
 * **Anyone may raise one.** `raise` does not check a role. A patient hitting the
 * call button, a visitor, a porter — all of them can report, because a system
 * that refuses an alert from the wrong account is worse than one that occasionally
 * receives a false alarm. Everything *after* the report is staff-only: only
 * employees see the board, acknowledge, or resolve.
 *
 * Acknowledgement is first-responder-wins, decided by a compare-and-set in the
 * database (`acknowledge` guards on `acknowledgedAt: null`). Two nurses hitting
 * "I've got this" simultaneously must not both believe they own the call, and a
 * read-then-write would let the second silently overwrite the first.
 */
class EmergencyService {
  constructor({
    emergencies = emergencyRepository,
    patients = patientRepository,
    users = userRepository,
    notifications = notificationService,
    realtime = realtimeService,
  } = {}) {
    this.emergencies = emergencies;
    this.patients = patients;
    this.users = users;
    this.notifications = notifications;
    this.realtime = realtime;
  }

  // --- Reads ----------------------------------------------------------------

  /** The live board: open and acknowledged alerts. */
  activeBoard(query = {}, actor) {
    this._assertStaff(actor);
    return this.emergencies.activeBoard(query);
  }

  /** Full history, including resolved. */
  list(query = {}, actor) {
    this._assertStaff(actor);
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
    if (query.patientId) filter.patient = query.patientId;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lt = new Date(query.to);
    }
    return this.emergencies.paginate(filter, query, {
      populate: [
        { path: 'patient', select: 'medicalRecordNumber ward' },
        { path: 'reportedBy', select: 'name role' },
      ],
    });
  }

  async getById(emergencyId, actor) {
    this._assertStaff(actor);
    const emergency = await this.emergencies.findById(emergencyId, {
      populate: [
        { path: 'patient', select: 'medicalRecordNumber ward' },
        { path: 'reportedBy', select: 'name role' },
        { path: 'acknowledgedBy', select: 'name role' },
        { path: 'resolvedBy', select: 'name role' },
      ],
    });
    if (!emergency) throw ApiError.notFound('Emergency');
    return emergency;
  }

  /** A patient's alert history — clinical context, so the clinical tier applies. */
  async listForPatient(patientId, actor, query = {}) {
    const patient = await this.patients.findById(patientId, {
      projection: 'user ward primaryDoctor assignedNurses',
    });
    if (!patient) throw ApiError.notFound('Patient');
    if (!accessPolicy.canReadCareData(actor)) {
      throw ApiError.forbidden('Emergency history is visible to clinical staff only');
    }
    return this.emergencies.listForPatient(patient._id, query);
  }

  /** The badge on the navigation bar. */
  countOpen(actor) {
    this._assertStaff(actor);
    return this.emergencies.countOpen();
  }

  // --- Writes ---------------------------------------------------------------

  /**
   * Raises an alert.
   *
   * Deliberately permissive about who: see the class comment. It is also
   * deliberately cheap — one insert, then a synchronous broadcast, then everything
   * slow detached. Validation is minimal for the same reason; the only thing that
   * can reject a report is a malformed type, and a missing patient reference is
   * dropped rather than raised, because a caller who mistypes a patient id during
   * a cardiac arrest should still summon the crash team.
   */
  async raise(payload = {}, actor) {
    if (!actor) throw ApiError.unauthorized();

    const type = payload.type || EMERGENCY_TYPE.MEDICAL;
    const severity = payload.severity || EMERGENCY_SEVERITY.HIGH;

    let patientId = null;
    if (payload.patientId) {
      const patient = await this.patients.findById(payload.patientId, { projection: '_id ward' });
      if (patient) {
        patientId = patient._id;
      } else {
        logger.warn('Emergency raised against an unknown patient id — reporting anyway', {
          patientId: String(payload.patientId),
        });
      }
    }

    const emergency = await this.emergencies.create({
      reportedBy: actor.id,
      type,
      severity,
      description: payload.description,
      location: payload.location,
      patient: patientId,
      status: EMERGENCY_STATUS.OPEN,
    });

    const alert = emergency.toJSON();

    // Synchronous, and first: this is the fast path the whole collection exists
    // for. Every logged-in employee gets it regardless of ward — a fire alert is
    // not a ward-scoped event, and a medical one may need hands from next door.
    this.realtime.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, alert);

    // Slow, failure-prone and irrelevant to the responder already looking at the
    // board, so it never blocks the reporter's request.
    this._page(alert).catch((error) =>
      logger.error('Emergency paging failed', {
        emergencyId: String(emergency._id),
        error: error.message,
      })
    );

    logger.warn('Emergency raised', {
      emergencyId: String(emergency._id),
      type,
      severity,
      by: String(actor.id),
      ward: payload.location && payload.location.ward,
    });
    return alert;
  }

  /**
   * Claims the call.
   *
   * The repository's guarded update is the authority. A null return means the
   * filter matched nothing, which is either "no such alert" or — far more likely —
   * "somebody else answered a half-second ago". The second case is reported with
   * the responder's name, because the useful answer to "I tried to take that call"
   * is who has it, not that you failed.
   */
  async acknowledge(emergencyId, actor) {
    this._assertResponder(actor);

    const claimed = await this.emergencies.acknowledge(emergencyId, actor.id);
    if (!claimed) {
      const existing = await this.emergencies.findById(emergencyId, {
        projection: 'status acknowledgedBy',
        populate: { path: 'acknowledgedBy', select: 'name role' },
      });
      if (!existing) throw ApiError.notFound('Emergency');
      const responder = existing.acknowledgedBy;
      throw ApiError.conflict(
        responder
          ? `${responder.name} has already responded to this alert`
          : 'This alert has already been handled',
        { code: 'ALREADY_ACKNOWLEDGED' }
      );
    }

    this.realtime.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, claimed);
    logger.info('Emergency acknowledged', {
      emergencyId: String(emergencyId),
      by: String(actor.id),
    });
    return claimed;
  }

  /**
   * Closes the call.
   *
   * Resolution requires notes: an alert that was raised and then silently closed
   * is indistinguishable from one that was ignored, and this collection is the
   * evidence trail for incident review.
   *
   * An unacknowledged alert can be resolved directly — a false alarm cancelled by
   * the person who raised it never needs a responder — but the resolver is
   * recorded either way.
   */
  async resolve(emergencyId, { notes } = {}, actor) {
    this._assertResponder(actor);
    if (!notes) throw ApiError.badRequest('Resolution notes are required');

    const resolved = await this.emergencies.updateOne(
      { _id: emergencyId, status: { $in: this.emergencies.openStatuses } },
      {
        $set: {
          status: EMERGENCY_STATUS.RESOLVED,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
          resolutionNotes: notes,
        },
      }
    );

    if (!resolved) {
      const existing = await this.emergencies.findById(emergencyId, { projection: 'status' });
      if (!existing) throw ApiError.notFound('Emergency');
      throw ApiError.conflict('This alert is already resolved', { code: 'ALREADY_RESOLVED' });
    }

    this.realtime.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, resolved);
    logger.info('Emergency resolved', {
      emergencyId: String(emergencyId),
      by: String(actor.id),
      responseTimeMinutes: this._minutesBetween(resolved.createdAt, resolved.resolvedAt),
    });
    return resolved;
  }

  /**
   * Raises the severity of a live alert.
   *
   * Escalation only — severity never drops. Downgrading an alert mid-incident is
   * how a critical call quietly leaves the board it was meant to stay on; if it
   * turns out to be a false alarm, resolve it with notes instead.
   */
  async escalate(emergencyId, severity, actor) {
    this._assertResponder(actor);
    const rank = [
      EMERGENCY_SEVERITY.LOW,
      EMERGENCY_SEVERITY.MEDIUM,
      EMERGENCY_SEVERITY.HIGH,
      EMERGENCY_SEVERITY.CRITICAL,
    ];
    const target = rank.indexOf(severity);
    if (target === -1) throw ApiError.badRequest('Unknown severity');

    const emergency = await this.emergencies.findById(emergencyId, {
      projection: 'severity status type location patient',
    });
    if (!emergency) throw ApiError.notFound('Emergency');
    if (emergency.status === EMERGENCY_STATUS.RESOLVED) {
      throw ApiError.conflict('A resolved alert cannot be escalated', { code: 'ALREADY_RESOLVED' });
    }
    if (target <= rank.indexOf(emergency.severity)) {
      throw ApiError.badRequest('Severity can only be raised', { code: 'NO_DOWNGRADE' });
    }

    const updated = await this.emergencies.updateById(emergencyId, { $set: { severity } });

    this.realtime.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, updated);
    this._page(updated).catch((error) =>
      logger.error('Escalation paging failed', { error: error.message })
    );

    logger.warn('Emergency escalated', {
      emergencyId: String(emergencyId),
      from: emergency.severity,
      to: severity,
      by: String(actor.id),
    });
    return updated;
  }

  // --- Reporting ------------------------------------------------------------

  /**
   * Response-time statistics over a window.
   *
   * Computed in the database rather than by pulling documents and reducing in
   * Node: a year of alerts is a lot of documents to move across the wire to
   * produce four numbers.
   */
  async responseStats({ from, to } = {}, actor) {
    this._assertStaff(actor);
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.emergencies.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { type: '$type', severity: '$severity' },
          total: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', EMERGENCY_STATUS.RESOLVED] }, 1, 0] },
          },
          avgResponseMs: {
            $avg: {
              $cond: [
                { $ifNull: ['$resolvedAt', false] },
                { $subtract: ['$resolvedAt', '$createdAt'] },
                null,
              ],
            },
          },
        },
      },
      { $sort: { total: -1 } },
    ]);

    return {
      from: start,
      to: end,
      breakdown: rows.map((row) => ({
        type: row._id.type,
        severity: row._id.severity,
        total: row.total,
        resolved: row.resolved,
        avgResponseMinutes:
          row.avgResponseMs === null ? null : Math.round(row.avgResponseMs / 60000),
      })),
    };
  }

  // --- internals -----------------------------------------------------------

  /** @private */
  _assertStaff(actor) {
    if (!actor || !STAFF_ROLES.includes(actor.role)) {
      throw ApiError.forbidden('Emergency alerts are visible to staff only');
    }
  }

  /**
   * @private answering a call is a clinical act.
   *
   * Widened to include site management, because a fire or security alert is
   * theirs to own and a nurse should not have to claim it to close it.
   */
  _assertResponder(actor) {
    const allowed = [...CLINICAL_ROLES, ROLES.ADMIN, ROLES.MANAGER];
    if (!actor || !allowed.includes(actor.role)) {
      throw ApiError.forbidden('Only clinical staff and site management can respond to alerts');
    }
  }

  /**
   * @private out-of-band paging for the severities that warrant it.
   *
   * Deliberately *not* everyone: a low-severity report belongs on the board, and
   * SMS-ing three hundred people about a spill is how a hospital learns to ignore
   * its own alerts. The recipient list is capped for the same reason.
   */
  async _page(alert) {
    if (!PAGING_SEVERITIES.includes(alert.severity)) return { paged: 0 };

    const responders = await this.users.find(
      { role: { $in: [...CLINICAL_ROLES, ROLES.ADMIN, ROLES.MANAGER] }, isActive: true },
      { projection: '_id', lean: true, limit: MAX_RESPONDERS }
    );
    if (!responders.length) return { paged: 0 };

    const where = alert.location && alert.location.ward ? ` in ${alert.location.ward}` : '';
    await this.notifications.notifyMany(
      responders.map((user) => user._id),
      {
        title: `${alert.severity === EMERGENCY_SEVERITY.CRITICAL ? 'CRITICAL' : 'Urgent'}: ${
          alert.type
        } emergency`,
        message: `${alert.description || 'An emergency has been reported'}${where}.`,
        type: NOTIFICATION_TYPE.EMERGENCY,
        // Critical alerts leave the app; anything less stays in it.
        channels:
          alert.severity === EMERGENCY_SEVERITY.CRITICAL
            ? [NOTIFICATION_CHANNEL.IN_APP, NOTIFICATION_CHANNEL.SMS]
            : [NOTIFICATION_CHANNEL.IN_APP],
        data: { emergencyId: String(alert.id || alert._id) },
      }
    );

    return { paged: responders.length };
  }

  /** @private */
  _minutesBetween(start, end) {
    if (!start || !end) return null;
    return Math.round((new Date(end) - new Date(start)) / 60000);
  }
}

module.exports = new EmergencyService();
module.exports.EmergencyService = EmergencyService;
