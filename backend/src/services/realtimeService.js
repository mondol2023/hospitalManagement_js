'use strict';

const logger = require('../config/logger');
const { SOCKET_ROOMS } = require('../utils/constants');
const context = require('../utils/context');
const { TenantContextMissingError } = require('../utils/tenantErrors');

/**
 * The one seam between business logic and Socket.IO.
 *
 * Services must be able to say "tell the care team about this" without requiring
 * `socket.io`, otherwise every unit test needs a live server and every service
 * inherits a transport dependency it has no business having. So the server
 * *injects* its `io` instance here at boot (`realtimeService.attach(io)`), and
 * until then — and in every unit test — emitting is a silent no-op.
 *
 * That also makes the fan-out honest: a socket emit is best-effort by nature
 * (recipients may be offline), so a failure here is logged, never thrown. Durable
 * delivery is the notification service's job, not this one's.
 */
class RealtimeService {
  constructor() {
    this.io = null;
  }

  attach(io) {
    this.io = io;
    logger.info('Realtime service attached to Socket.IO');
  }

  detach() {
    this.io = null;
  }

  get isAttached() {
    return Boolean(this.io);
  }

  /** @private single choke point so one failed emit cannot fail a request. */
  _emit(room, event, payload) {
    if (!this.io) return false;
    try {
      this.io.to(room).emit(event, payload);
      return true;
    } catch (error) {
      logger.error('Realtime emit failed', { room, event, error: error.message });
      return false;
    }
  }

  /** @private organisation of the current scope; throws rather than emit globally. */
  _organizationId() {
    const organizationId = context.get()?.organizationId;
    if (!organizationId) throw new TenantContextMissingError();
    return String(organizationId);
  }

  toUser(userId, event, payload) {
    return this._emit(SOCKET_ROOMS.user(userId), event, payload);
  }

  /** Fan-out to a list of users, de-duplicated so nobody gets the event twice. */
  toUsers(userIds, event, payload) {
    const unique = [...new Set((userIds || []).map(String))];
    unique.forEach((id) => this.toUser(id, event, payload));
    return unique.length;
  }

  toConversation(conversationId, event, payload) {
    return this._emit(SOCKET_ROOMS.conversation(conversationId), event, payload);
  }

  /** Every logged-in staff member — emergencies, hospital-wide announcements. */
  toStaff(event, payload) {
    return this._emit(SOCKET_ROOMS.staff(this._organizationId()), event, payload);
  }

  toRole(role, event, payload) {
    return this._emit(SOCKET_ROOMS.role(this._organizationId(), role), event, payload);
  }

  /**
   * The clinical room for one patient: their doctors and nurses.
   *
   * Patients themselves are *not* in this room — care logs, bed moves and
   * medication events are staff-only, and the room boundary is what enforces
   * that on the socket side.
   */
  toPatientCare(patientId, event, payload) {
    return this._emit(SOCKET_ROOMS.patientCare(patientId), event, payload);
  }
}

module.exports = new RealtimeService();
module.exports.RealtimeService = RealtimeService;
