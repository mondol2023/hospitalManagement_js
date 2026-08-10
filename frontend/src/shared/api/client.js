/* eslint-disable no-restricted-imports -- this is the one module allowed to know axios exists */
import axios from 'axios';
import { ApiError } from './envelope';
import { ERROR_CODES } from './errorCodes';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';
const noopBridge = {
    getAccessToken: () => null,
    getRefreshToken: () => null,
    onRefreshed: () => { },
    onSessionEnded: () => { },
};
let bridge = noopBridge;
export function registerAuthBridge(next) {
    bridge = next;
}
export const http = axios.create({
    baseURL: API_BASE_URL,
    timeout: 20_000,
    // We are a Bearer-token client, not a cookie client. Saying so explicitly
    // means a future CORS misconfiguration can't quietly start sending
    // ambient credentials.
    withCredentials: false,
    headers: { 'Content-Type': 'application/json' },
});
/** Requests that must never carry an Authorization header or trigger a refresh. */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
function isPublic(url) {
    if (!url)
        return false;
    return PUBLIC_PATHS.some((path) => url.startsWith(path));
}
http.interceptors.request.use((config) => {
    if (!isPublic(config.url)) {
        const token = bridge.getAccessToken();
        if (token)
            config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
});
// ── 401 → refresh → retry, with concurrent-401 coalescing ────────────────────
//
// A dashboard fires eight requests at once. The access token expired a second
// ago, so all eight come back 401. Naively each would call /auth/refresh, and
// the backend rotates-and-denylists on every refresh — so seven of those eight
// would present an already-spent token and get the whole session revoked as
// suspected token reuse.
//
// So: exactly one refresh is ever in flight. Everyone else awaits the same
// promise and then retries with whatever token that call produced.
let refreshInFlight = null;
async function refreshAccessToken() {
    const refreshToken = bridge.getRefreshToken();
    if (!refreshToken)
        throw new ApiError(ERROR_CODES.TOKEN_MISSING, 'No active session', 401);
    // A bare axios call, not `http`: going through the instance would re-enter
    // this interceptor on failure and recurse.
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 20_000 });
    const data = response.data.data;
    if (!data?.accessToken || !data.refreshToken) {
        throw new ApiError(ERROR_CODES.TOKEN_REVOKED, 'Session could not be renewed', 401);
    }
    bridge.onRefreshed({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
}
/** Public so a proactive pre-expiry refresh (auth/session.ts) shares the same lock. */
export function refreshSession() {
    if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
}
http.interceptors.response.use((response) => response, async (error) => {
    const config = error.config;
    if (error.response?.status === 401 && config && !config._retried && !isPublic(config.url)) {
        config._retried = true;
        try {
            const token = await refreshSession();
            config.headers.set('Authorization', `Bearer ${token}`);
            return await http.request(config);
        }
        catch {
            bridge.onSessionEnded(ERROR_CODES.TOKEN_REVOKED);
            throw new ApiError(ERROR_CODES.TOKEN_REVOKED, 'Your session ended. Please sign in again.', 401);
        }
    }
    throw toApiError(error);
});
function toApiError(error) {
    if (error.response) {
        const { status, data } = error.response;
        const envelope = data?.error;
        if (envelope?.code) {
            return new ApiError(envelope.code, envelope.message, status, envelope.details);
        }
        // Non-envelope failure (proxy error page, 502 from a load balancer).
        return new ApiError(status === 429 ? ERROR_CODES.RATE_LIMITED : ERROR_CODES.INTERNAL_ERROR, `Request failed with status ${status}`, status);
    }
    if (error.code === 'ECONNABORTED') {
        return new ApiError('TIMEOUT', 'The server took too long to respond.', 0);
    }
    return ApiError.network();
}
/**
 * Envelope unwrapping, once. Feature `api.ts` modules call these and get the
 * payload directly — no `res.data.data` chains scattered through the codebase.
 */
function unwrap(envelope) {
    if (envelope.success === false || envelope.data === undefined) {
        const err = envelope.error;
        throw new ApiError(err?.code ?? ERROR_CODES.INTERNAL_ERROR, err?.message ?? 'Malformed response from server', 500, err?.details);
    }
    return envelope.data;
}
export const api = {
    async get(url, config) {
        const res = await http.get(url, config);
        return unwrap(res.data);
    },
    async post(url, body, config) {
        const res = await http.post(url, body ?? {}, config);
        return unwrap(res.data);
    },
    async patch(url, body, config) {
        const res = await http.patch(url, body ?? {}, config);
        return unwrap(res.data);
    },
    async put(url, body, config) {
        const res = await http.put(url, body ?? {}, config);
        return unwrap(res.data);
    },
    async delete(url, config) {
        const res = await http.delete(url, config);
        return unwrap(res.data);
    },
    /**
     * List endpoints return items in `data` and pagination in `meta`. Folding
     * them back into one `Page<T>` here keeps every list hook identical.
     */
    async page(url, config) {
        const res = await http.get(url, config);
        const items = unwrap(res.data);
        const pagination = res.data.meta?.pagination ?? {
            page: 1,
            limit: items.length,
            total: items.length,
            totalPages: 1,
        };
        return { items, pagination };
    },
};
