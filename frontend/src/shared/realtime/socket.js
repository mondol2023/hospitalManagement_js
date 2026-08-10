import { io } from 'socket.io-client';
import { API_BASE_URL } from '@/shared/api/client';
/**
 * The socket namespace is the API origin without the `/api/v1` path — socket.io
 * mounts on the HTTP server root, not under the REST prefix.
 */
function socketOrigin() {
    try {
        return new URL(API_BASE_URL, window.location.origin).origin;
    }
    catch {
        return window.location.origin;
    }
}
let socket = null;
let currentToken = null;
export function getSocket() {
    return socket;
}
/**
 * Opens the connection, or re-authenticates an existing one after a token
 * refresh. Re-authentication is a disconnect/connect rather than an in-place
 * header swap: the backend authenticates once in its handshake middleware, so
 * a rotated token only takes effect on a new handshake.
 */
export function connectSocket(token) {
    if (socket && currentToken === token)
        return socket;
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
    });
    return socket;
}
export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
    currentToken = null;
}
