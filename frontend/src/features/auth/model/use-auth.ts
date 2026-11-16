import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '@/shared/api/envelope';
import { appPath, PUBLIC_ROUTES } from '@/shared/lib/routes';
import { toast } from '@/shared/ui';

import { authApi } from '../api/auth-api';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './schemas';
import { useAuthStore } from './auth-store';

/**
 * The mutations every auth screen uses.
 *
 * `queryClient.clear()` on the way out is not housekeeping — the cache holds
 * patient names, bed assignments and invoice totals from the previous session.
 * Leaving it in place means the next person to sign in on a shared ward
 * terminal sees the last user's data flash up before their own loads.
 */
export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (session) => {
      queryClient.clear();
      setSession(session);
      navigate(appPath(), { replace: true });
    },
    // Deliberately no toast here: the form renders the error inline, next to
    // the fields it concerns. Two surfaces for one failure is noise.
  });
}

export function useRegister() {
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (session) => {
      queryClient.clear();
      setSession(session);
      navigate(appPath(), { replace: true });
    },
  });
}

export function useLogout() {
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { refreshToken } = useAuthStore.getState();
      try {
        await authApi.logout(refreshToken);
      } catch (error) {
        // Swallowed on purpose. The local session is cleared either way; an
        // unreachable server must not trap someone in a signed-in UI.
        if (!(error instanceof ApiError)) throw error;
      }
    },
    onSettled: () => {
      clear();
      queryClient.clear();
      navigate(PUBLIC_ROUTES.login, { replace: true });
    },
  });
}

export function useLogoutEverywhere() {
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logoutEverywhere(),
    onSuccess: () => {
      toast.success('Signed out everywhere', 'All other devices will need to sign in again.');
      clear();
      queryClient.clear();
      navigate(PUBLIC_ROUTES.login, { replace: true });
    },
  });
}

/**
 * Changing the password signs every *other* device out (the server bumps
 * `tokensValidFrom`) and hands this one a replacement pair, so the session is
 * swapped in place rather than ended — the person changing their password
 * should not be the one who has to sign in again.
 *
 * No `onError` toast: the form puts the failure next to the field it concerns.
 */
export function useChangePassword() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (input: Pick<ChangePasswordInput, 'currentPassword' | 'newPassword'>) =>
      authApi.changePassword(input),
    onSuccess: (session) => {
      setSession(session);
      toast.success('Password changed', 'Your other devices have been signed out.');
    },
  });
}
