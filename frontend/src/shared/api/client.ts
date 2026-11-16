/* eslint-disable no-restricted-imports -- this is the one module allowed to know axios exists */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { ApiError, type ApiEnvelope, type Page } from './envelope';
import { ERROR_CODES } from './errorCodes';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

/**
 * The HTTP layer, and the only place in the app that knows about axios,
 * bearer headers or token refresh.
 *
 * ── Why a "bridge" instead of importing the auth store ──────────────────────
 * `shared/` must not depend on `features/` (enforced by ESLint, §4). The auth
 * feature owns the session; this module needs to *read* it. So the dependency
 * is inverted: the client declares the narrow interface it needs, and the auth
 * feature registers an implementation at startup. Swapping the session store
 * later touches one registration, not this file.
 */
export interface AuthBridge {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  /** Called with a freshly rotated pair so the store can adopt it. */
  onRefreshed: (tokens: { accessToken: string; refreshToken: string }) => void;
  /** Called when the session is unrecoverable — store should clear and redirect. */
  onSessionEnded: (reason: string) => void;
}

const noopBridge: AuthBridge = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  onRefreshed: () => {},
  onSessionEnded: () => {},
};

let bridge: AuthBridge = noopBridge;

export function registerAuthBridge(next: AuthBridge): void {
  bridge = next;
}

export const http: AxiosInstance = axios.create({
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

function isPublic(url: string | undefined): boolean {
  if (!url) return false;
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!isPublic(config.url)) {
    const token = bridge.getAccessToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
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
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = bridge.getRefreshToken();
  if (!refreshToken) throw new ApiError(ERROR_CODES.TOKEN_MISSING, 'No active session', 401);

  // A bare axios call, not `http`: going through the instance would re-enter
  // this interceptor on failure and recurse.
  const response = await axios.post<
    ApiEnvelope<{ accessToken: string; refreshToken: string; user: unknown }>
  >(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 20_000 });

  const data = response.data.data;
  if (!data?.accessToken || !data.refreshToken) {
    throw new ApiError(ERROR_CODES.TOKEN_REVOKED, 'Session could not be renewed', 401);
  }

  bridge.onRefreshed({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.accessToken;
}

/** Public so a proactive pre-expiry refresh (auth/session.ts) shares the same lock. */
export function refreshSession(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && config && !config._retried && !isPublic(config.url)) {
      config._retried = true;

      let token: string;
      try {
        token = await refreshSession();
      } catch {
        bridge.onSessionEnded(ERROR_CODES.TOKEN_REVOKED);
        throw new ApiError(ERROR_CODES.TOKEN_REVOKED, 'Your session ended. Please sign in again.', 401);
      }

      // Outside the try on purpose. Once the refresh has worked the session is
      // alive, so whatever the retry says is the endpoint's own answer — and a
      // 401 can be exactly that (change-password refuses a wrong current
      // password with one). Treating it as a dead session would sign someone
      // out for mistyping a password.
      config.headers.set('Authorization', `Bearer ${token}`);
      return http.request(config);
    }

    throw toApiError(error);
  }
);

function toApiError(error: AxiosError<ApiEnvelope<unknown>>): ApiError {
  if (error.response) {
    const { status, data } = error.response;
    const envelope = data?.error;
    if (envelope?.code) {
      return new ApiError(envelope.code, envelope.message, status, envelope.details);
    }
    // Non-envelope failure (proxy error page, 502 from a load balancer).
    return new ApiError(
      status === 429 ? ERROR_CODES.RATE_LIMITED : ERROR_CODES.INTERNAL_ERROR,
      `Request failed with status ${status}`,
      status
    );
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
function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.success === false || envelope.data === undefined) {
    const err = envelope.error;
    throw new ApiError(
      err?.code ?? ERROR_CODES.INTERNAL_ERROR,
      err?.message ?? 'Malformed response from server',
      500,
      err?.details
    );
  }
  return envelope.data;
}

export const api = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await http.get<ApiEnvelope<T>>(url, config);
    return unwrap(res.data);
  },
  async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await http.post<ApiEnvelope<T>>(url, body ?? {}, config);
    return unwrap(res.data);
  },
  async patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await http.patch<ApiEnvelope<T>>(url, body ?? {}, config);
    return unwrap(res.data);
  },
  async put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await http.put<ApiEnvelope<T>>(url, body ?? {}, config);
    return unwrap(res.data);
  },
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await http.delete<ApiEnvelope<T>>(url, config);
    return unwrap(res.data);
  },

  /**
   * List endpoints return items in `data` and pagination in `meta`. Folding
   * them back into one `Page<T>` here keeps every list hook identical.
   */
  async page<T>(url: string, config?: AxiosRequestConfig): Promise<Page<T>> {
    const res = await http.get<ApiEnvelope<T[]>>(url, config);
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
