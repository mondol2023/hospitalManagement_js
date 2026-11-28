'use strict';

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { normalise } = require('../middleware/errorHandler');
const { tenantStoreFor } = require('../middleware/authenticate');
const context = require('../utils/context');

/**
 * The socket equivalent of `asyncHandler` + `validate` + `errorHandler`.
 *
 * A websocket has no status line and no error middleware, so without something
 * like this every handler ends up with its own try/catch and its own idea of what
 * a failure looks like — and a rejected promise inside a socket listener is an
 * unhandled rejection, which in Node 15+ kills the process. One bad payload from
 * one client must not take down every other connection on the worker.
 *
 * The contract is deliberately identical to the REST one: the same zod schema
 * shape, the same `ApiError` taxonomy, the same "operational errors are
 * explained, defects are not" rule, and the same acknowledgement envelope as the
 * HTTP body — `{ success, data }` or `{ success, error: { code, message } }`.
 * A client should be able to reuse its response handling across both transports.
 */

const ERROR_EVENT = 'app:error';

/** Acknowledgement callbacks are optional in socket.io; emitting is not. */
function respond(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function toEnvelope(error, event, socket) {
  const normalised = normalise(error);
  const operational = normalised instanceof ApiError;

  const context = {
    event,
    socketId: socket.id,
    userId: socket.data.user?.id,
  };

  if (operational && normalised.statusCode < 500) {
    logger.warn(normalised.message, { ...context, code: normalised.code });
  } else {
    logger.error(normalised.message, {
      ...context,
      code: operational ? normalised.code : 'INTERNAL_ERROR',
      stack: (normalised.cause || normalised).stack,
    });
  }

  return {
    success: false,
    error: {
      code: operational ? normalised.code : 'INTERNAL_ERROR',
      message: operational ? normalised.message : 'Internal server error',
      status: operational ? normalised.statusCode : 500,
      ...(operational && normalised.details ? { details: normalised.details } : {}),
    },
  };
}

/**
 * Registers one validated, error-contained event listener.
 *
 * @param {import('socket.io').Socket} socket
 * @param {string} event
 * @param {import('zod').ZodType} schema payload schema; unknown keys are stripped
 * @param {(data: any, socket: object) => Promise<any>} handler
 */
function on(socket, event, schema, handler) {
  socket.on(event, async (rawPayload, ack) => {
    // Clients routinely send only an ack for parameterless events, and a
    // function is not a payload.
    const payload = typeof rawPayload === 'function' ? {} : rawPayload;
    const callback = typeof rawPayload === 'function' ? rawPayload : ack;

    try {
      // The budget is consumed before validation, so a flood of malformed
      // payloads costs the same as a flood of valid ones.
      const guard = socket.data.rateGuard;
      if (guard && !guard.hit()) {
        throw ApiError.tooManyRequests(
          `Too many realtime events. Please retry in ${guard.retryAfterSeconds}s.`
        );
      }

      const data = schema.parse(payload ?? {});
      // Each event enters its tenant here, so no gateway needs to know about it.
      const actor = socket.data.user;
      const store = { requestId: socket.id, source: 'socket', ...(actor ? tenantStoreFor(actor) : {}) };
      const result = await context.run(store, () => handler(data, socket));
      respond(callback, { success: true, data: result === undefined ? null : result });
    } catch (error) {
      const envelope = toEnvelope(error, event, socket);
      respond(callback, envelope);
      // Emitted as well as acknowledged: a client that fires and forgets still
      // needs to learn that its subscription never happened.
      socket.emit(ERROR_EVENT, { event, ...envelope.error });
    }
  });
}

module.exports = { on, respond, toEnvelope, ERROR_EVENT };
