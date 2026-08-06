import { api } from '@/shared/api/client';
import type { AuthSession, User } from '@/shared/types/domain';

import type { ChangePasswordInput, LoginInput, RegisterInput } from '../model/schemas';
import { toRegisterPayload } from '../model/schemas';

/**
 * Every auth endpoint in one place, typed against the backend's real responses
 * (`authService.js`): login, register, refresh and change-password all return
 * `{ user, accessToken, refreshToken, tokenType, expiresIn }`.
 */
export const authApi = {
  login: (input: LoginInput) => api.post<AuthSession>('/auth/login', input),

  register: (input: RegisterInput) => api.post<AuthSession>('/auth/register', toRegisterPayload(input)),

  /**
   * Best-effort. The server revokes the refresh token; if the call fails we
   * clear the session locally anyway, because refusing to sign someone out
   * because the network is down is the wrong failure mode.
   */
  logout: (refreshToken: string | null) =>
    api.post<{ revoked: boolean }>('/auth/logout', refreshToken ? { refreshToken } : {}),

  logoutEverywhere: () => api.post<{ revoked: boolean }>('/auth/logout-all'),

  me: () => api.get<User>('/auth/me'),

  /**
   * Returns a fresh pair: the server bumps `tokensValidFrom`, which signs every
   * *other* device out, and hands this one a replacement so it survives.
   */
  changePassword: (input: Pick<ChangePasswordInput, 'currentPassword' | 'newPassword'>) =>
    api.post<AuthSession>('/auth/change-password', input),
};
