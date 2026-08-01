'use strict';

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const env = require('../config/env');
const logger = require('../config/logger');
const { createRedisClient } = require('../config/redis');
const { buildCorsOptions } = require('../middleware/security');
const { resolveActor } = require('../middleware/authenticate');
const accessPolicy = require('../utils/accessPolicy');
const { SOCKET_ROOMS } = require('../utils/constants');
const realtimeService = require('../services/realtimeService');
const RateGuard = require('./rateGuard');
const { registerChatHandlers } = require('./chatGateway');
const { registerCareHandlers } = require('./careGateway');

/**
 * The realtime server.
 *
 * Three things make this scale past one box, and all three are the reason this
 * file exists rather than a handful of `io.on` calls in `server.js`:
 *
 *  - **A Redis adapter.** Without it, `io.to(room).emit()` only reaches sockets
 *    connected to *this* process. With four cluster workers that means three out
 *    of four participants miss every message — a bug that never appears in
 *    development, where there is one worker, and appears immediately in
 *    production. With Redis off the adapter is skipped and the app runs
 *    single-instance, which is honest rather than silently broken.
 *  - **Rooms instead of per-socket bookkeeping.** No map of user → socket ids is
 *    maintained here; the adapter already keeps one, shared across the cluster,
 *    and a second copy in process memory would be wrong the moment a worker
 *    restarts.
 *  - **The same authentication as HTTP.** The handshake runs `resolveActor`, the
 *    exact function the `authenticate` middleware uses, so a revoked token or a
 *    deactivated account is refused a socket for the same reasons it is refused a
 *    request.
 */

/** Rooms a socket is placed in the moment it authenticates. */
function roomsFor(actor) {
  const rooms = [SOCKET_ROOMS.user(actor.id), SOCKET_ROOMS.role(actor.role)];
  if (accessPolicy.isStaff(actor.role)) rooms.push(SOCKET_ROOMS.staff());
  return rooms;
}

/**
 * Reads the credential from the handshake.
 *
 * `auth.token` is the documented client field; the Authorization header is
 * accepted too because a native client reusing its HTTP layer will send it there.
 * The query string is deliberately not read — it lands in access logs.
 */
function extractHandshakeToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.replace(/^Bearer[ \t]+/i, '').trim();
  }

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
    if (match) return match[1];
  }

  return null;
}

/**
 * Handshake authentication.
 *
 * A rejection here closes the connection before any handler is registered, so
 * an unauthenticated socket never exists in a half-usable state. The reason is
 * passed as `err.data` so the client can distinguish "token expired, refresh and
 * reconnect" from "account disabled, stop retrying" — reconnect storms from
 * clients that cannot tell the difference are their own kind of outage.
 */
async function authenticateSocket(socket, next) {
  try {
    const token = extractHandshakeToken(socket);
    if (!token) {
      const error = new Error('Authentication required');
      error.data = { code: 'TOKEN_MISSING', retryable: false };
      return next(error);
    }

    const actor = await resolveActor(token);
    socket.data.user = actor;
    socket.data.rateGuard = new RateGuard();
    return next();
  } catch (cause) {
    const error = new Error(cause.message || 'Authentication failed');
    error.data = {
      code: cause.code || 'UNAUTHORIZED',
      retryable: cause.code === 'TOKEN_EXPIRED',
    };
    return next(error);
  }
}

/**
 * Attaches the cross-process backplane.
 *
 * The pub/sub pair gets its own options: an adapter client must queue while
 * reconnecting and must not give up on a command after two tries, which is the
 * opposite of what the cache client wants. Sharing the cache client would also
 * break it outright — a connection in subscriber mode refuses ordinary commands.
 */
function attachAdapter(io) {
  if (!env.redisEnabled) {
    logger.warn('Socket.IO running without the Redis adapter — single instance only');
    return null;
  }

  const overrides = { enableOfflineQueue: true, maxRetriesPerRequest: null };
  const pubClient = createRedisClient('socket-pub', overrides);
  const subClient = createRedisClient('socket-sub', overrides);
  if (!pubClient || !subClient) return null;

  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO Redis adapter attached');
  return { pubClient, subClient };
}

/**
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: buildCorsOptions(),
    // Long enough to survive a phone changing cell, short enough that a dead
    // socket frees its slot rather than lingering for the default two minutes.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // A chat message is kilobytes; anything larger is an upload, and uploads go
    // over HTTP where they can be scanned and streamed.
    maxHttpBufferSize: 1e5,
    transports: ['websocket', 'polling'],
  });

  attachAdapter(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const actor = socket.data.user;
    socket.join(roomsFor(actor));

    logger.debug('Socket connected', { socketId: socket.id, userId: actor.id, role: actor.role });

    registerChatHandlers(socket);
    registerCareHandlers(socket);

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { socketId: socket.id, userId: actor.id, reason });
    });
  });

  realtimeService.attach(io);
  return io;
}

/**
 * Closes the realtime server.
 *
 * `detach` runs first so that anything still finishing a request during shutdown
 * emits into a no-op rather than into a closing server. The Redis clients are not
 * closed here — they are in the shared registry and `disconnectRedis()` owns
 * their lifecycle, so closing them twice is not this function's problem.
 */
async function closeSocketServer(io) {
  if (!io) return;
  realtimeService.detach();
  await new Promise((resolve) => io.close(resolve));
}

module.exports = {
  createSocketServer,
  closeSocketServer,
  authenticateSocket,
  extractHandshakeToken,
  roomsFor,
};
