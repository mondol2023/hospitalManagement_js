import { create } from 'zustand';

import { registerAuthBridge } from '@/shared/api/client';
import type { AuthSession, User } from '@/shared/types/domain';

/**
 * The session, held in memory and nowhere else.
 *
 * ── Why no localStorage ─────────────────────────────────────────────────────
 * Anything in `localStorage` is readable by any JavaScript that ends up on the
 * page — a compromised dependency, a bad third-party script, one XSS hole. A
 * token in a JS variable is not *immune* to that, but it is not sitting in a
 * well-known key waiting to be exfiltrated wholesale, and it dies with the tab.
 *
 * The cost is real and deliberate: a hard reload signs the user out. The
 * correct fix for that is a backend change — an httpOnly, SameSite=Strict
 * refresh cookie the browser replays and JS cannot read — not a frontend
 * workaround that writes the token to disk. Until that exists, we take the
 * reload.
 */
interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /**
   * True until the app has decided whether there is a session to restore, so
   * guards do not bounce the user to /login in the meantime. Today that is
   * decided synchronously at startup by `AppProviders` (nothing is persisted).
   */
  isBootstrapping: boolean;
  /** Set when a session ends involuntarily, so /login can explain why. */
  endedReason: string | null;

  setSession: (session: AuthSession) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setUser: (user: User) => void;
  clear: (reason?: string) => void;
  finishBootstrap: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isBootstrapping: true,
  endedReason: null,

  setSession: ({ user, accessToken, refreshToken }) =>
    set({ user, accessToken, refreshToken, endedReason: null, isBootstrapping: false }),

  setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),

  setUser: (user) => set({ user }),

  clear: (reason) =>
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      endedReason: reason ?? null,
      isBootstrapping: false,
    }),

  finishBootstrap: () => set({ isBootstrapping: false }),
}));

/**
 * Closes the dependency inversion declared in `shared/api/client.ts`: the
 * client asked for four functions, the feature that owns the session supplies
 * them. Called once from `app/providers.tsx` before anything can issue a
 * request — module side effects would be tidier to write and much harder to
 * reason about under test.
 */
export function connectAuthBridge(): void {
  registerAuthBridge({
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    onRefreshed: (tokens) => useAuthStore.getState().setTokens(tokens),
    onSessionEnded: (reason) => useAuthStore.getState().clear(reason),
  });
}

/** Selectors — components subscribe to one slice, not the whole store. */
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => Boolean(state.accessToken && state.user);
export const selectRole = (state: AuthState) => state.user?.role ?? null;
