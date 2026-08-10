import { create } from 'zustand';
import { registerAuthBridge } from '@/shared/api/client';
export const useAuthStore = create((set) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    isBootstrapping: true,
    endedReason: null,
    setSession: ({ user, accessToken, refreshToken }) => set({ user, accessToken, refreshToken, endedReason: null, isBootstrapping: false }),
    setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
    setUser: (user) => set({ user }),
    clear: (reason) => set({
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
export function connectAuthBridge() {
    registerAuthBridge({
        getAccessToken: () => useAuthStore.getState().accessToken,
        getRefreshToken: () => useAuthStore.getState().refreshToken,
        onRefreshed: (tokens) => useAuthStore.getState().setTokens(tokens),
        onSessionEnded: (reason) => useAuthStore.getState().clear(reason),
    });
}
/** Selectors — components subscribe to one slice, not the whole store. */
export const selectUser = (state) => state.user;
export const selectIsAuthenticated = (state) => Boolean(state.accessToken && state.user);
export const selectRole = (state) => state.user?.role ?? null;
