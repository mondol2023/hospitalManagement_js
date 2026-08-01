'use strict';

const { z, objectId } = require('../validators/common');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { SOCKET_ROOMS } = require('../utils/constants');
const patientService = require('../services/patientService');
const { on } = require('./eventHandler');

/**
 * The bedside feed: doses given, services performed, observations, bed moves.
 *
 * This is the socket half of "only hospital staff, nurses and doctors see the
 * info". The patient is *not* admitted to their own care room — that is not an
 * oversight, it is the requirement. Their channel is the care-team conversation,
 * where clinicians choose what to say to them; this room carries the raw nursing
 * feed, which is written for colleagues.
 *
 * Two gates, both the same ones the REST layer uses: `canReadCareData` for the
 * clinical tier, then `requireVisible` for row-level access to *this* patient.
 * Passing the first and failing the second is the common case — a doctor on ward
 * B is clinical staff and still has no business watching ward A's drug rounds.
 */

const patientRef = z.object({ patientId: objectId });

/** @param {import('socket.io').Socket} socket */
function registerCareHandlers(socket) {
  const actor = socket.data.user;

  on(socket, 'care:subscribe', patientRef, async ({ patientId }) => {
    if (!accessPolicy.canReadCareData(actor)) {
      throw ApiError.forbidden('This clinical information is restricted to the care team');
    }

    // Throws 403/404 unless this actor may see this specific patient.
    await patientService.requireVisible(patientId, actor);
    await socket.join(SOCKET_ROOMS.patientCare(patientId));
    return { patient: String(patientId), subscribed: true };
  });

  on(socket, 'care:unsubscribe', patientRef, async ({ patientId }) => {
    await socket.leave(SOCKET_ROOMS.patientCare(patientId));
    return { patient: String(patientId), subscribed: false };
  });
}

module.exports = { registerCareHandlers };
