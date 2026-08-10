import { useEffect } from 'react';
import { refreshSession } from '@/shared/api/client';
import { useAuthStore } from './auth-store';
/**
 * Reads the `exp` claim out of a JWT without verifying it.
 *
 * To be explicit about what this is: the signature is *not* checked, and it
 * must not be. Only the server can verify this token, and only the server's
 * verdict means anything. We read `exp` purely to decide when to ask for a new
 * one — a scheduling hint, not an authorisation decision. If the claim is
 * missing or the token is malformed we return null and fall back to the 401
 * interceptor, which is the correct answer anyway.
 */
export function readTokenExpiry(token) {
    const payload = token.split('.')[1];
    if (!payload)
        return null;
    try {
        // base64url → base64, then decode. `atob` is fine here: the payload is
        // ASCII JSON, and nothing from it is ever rendered.
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const claims = JSON.parse(json);
        return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
    }
    catch {
        return null;
    }
}
/** Renew this long before the token actually expires. */
const RENEW_MARGIN_MS = 60_000;
/**
 * Refreshes the access token shortly before it expires.
 *
 * Without this, the first request after expiry always costs an extra
 * round-trip: fail with 401, refresh, retry. That is correct but visible —
 * and on a page that fires eight parallel requests, it is eight stalled
 * requests waiting on one refresh. Doing it ahead of time keeps the common
 * path clean; the 401 interceptor stays as the safety net for a tab that was
 * backgrounded through the whole window (timers are throttled when hidden).
 *
 * Both paths share `refreshSession()`'s single-flight lock, so a proactive
 * refresh and a 401-triggered one can never both spend the same token — which
 * the backend would read as token reuse and revoke the session for.
 */
export function useProactiveRefresh() {
    const accessToken = useAuthStore((state) => state.accessToken);
    useEffect(() => {
        if (!accessToken)
            return;
        const expiresAt = readTokenExpiry(accessToken);
        if (expiresAt === null)
            return;
        const delay = expiresAt - Date.now() - RENEW_MARGIN_MS;
        // Already inside the margin: refresh on the next tick rather than
        // immediately, so we never fire during render.
        const timer = window.setTimeout(() => {
            void refreshSession().catch(() => {
                // Failure is handled by the client's `onSessionEnded` bridge, which
                // clears the store and sends the user to /login.
            });
        }, Math.max(delay, 0));
        return () => window.clearTimeout(timer);
    }, [accessToken]);
}
