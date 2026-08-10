import { api } from '@/shared/api/client';
import { toRegisterPayload } from '../model/schemas';
/**
 * Every auth endpoint in one place, typed against the backend's real responses
 * (`authService.js`): login, register, refresh and change-password all return
 * `{ user, accessToken, refreshToken, tokenType, expiresIn }`.
 */
export const authApi = {
    login: (input) => api.post('/auth/login', input),
    register: (input) => api.post('/auth/register', toRegisterPayload(input)),
    /**
     * Best-effort. The server revokes the refresh token; if the call fails we
     * clear the session locally anyway, because refusing to sign someone out
     * because the network is down is the wrong failure mode.
     */
    logout: (refreshToken) => api.post('/auth/logout', refreshToken ? { refreshToken } : {}),
    logoutEverywhere: () => api.post('/auth/logout-all'),
    me: () => api.get('/auth/me'),
    /**
     * Returns a fresh pair: the server bumps `tokensValidFrom`, which signs every
     * *other* device out, and hands this one a replacement so it survives.
     */
    changePassword: (input) => api.post('/auth/change-password', input),
};
