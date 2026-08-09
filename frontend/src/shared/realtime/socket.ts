import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '@/shared/api/client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/shared/types/socket-events';

/**
 * The socket connection, as a module singleton.
 *
 * One connection per tab, not one per feature. Eight features each opening
 * their own socket would mean eight handshakes, eight room subscriptions and
 * eight copies of every broadcast — and the backend's `rateGuard` would start
 * dropping a legitimate user for looking like an attack.
 *
 * Like `shared/api/client.ts`, this module must not import from `features/`.
 * The app layer owns the session and calls `connectSocket(token)` when one
 * exists and `disconnectSocket()` when it ends.
 */

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * The socket namespace is the API origin without the `/api/v1` path — socket.io
 * mounts on the HTTP server root, not under the REST prefix.
 */
function socketOrigin(): string {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

let socket: AppSocket | null = null;
let currentToken: string | null = null;

export function getSocket(): AppSocket | null {
  return socket;
}

/**
 * Opens the connection, or re-authenticates an existing one after a token
 * refresh. Re-authentication is a disconnect/connect rather than an in-place
 * header swap: the backend authenticates once in its handshake middleware, so
 * a rotated token only takes effect on a new handshake.
 */
export function connectSocket(token: string): AppSocket {
  if (socket && currentToken === token) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  socket = io(socketOrigin(), {
    // The token goes in the handshake `auth` payload, not a query string:
    // query strings land in server access logs and proxy logs.
    auth: { token },
    transports: ['websocket'],
    // Long-lived reconnection with backoff. A ward tablet that drops off wifi
    // for a minute should come back on its own, and the exponential curve
    // keeps a server restart from producing a thundering herd.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    reconnectionAttempts: Infinity,
    withCredentials: false,
  }) as AppSocket;

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
