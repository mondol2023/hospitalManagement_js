import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/envelope';
import { toast } from '@/shared/ui';
import { authApi } from '../api/auth-api';
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
        mutationFn: (input) => authApi.login(input),
        onSuccess: (session) => {
            queryClient.clear();
            setSession(session);
            navigate('/', { replace: true });
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
        mutationFn: (input) => authApi.register(input),
        onSuccess: (session) => {
            queryClient.clear();
            setSession(session);
            navigate('/', { replace: true });
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
            }
            catch (error) {
                // Swallowed on purpose. The local session is cleared either way; an
                // unreachable server must not trap someone in a signed-in UI.
                if (!(error instanceof ApiError))
                    throw error;
            }
        },
        onSettled: () => {
            clear();
            queryClient.clear();
            navigate('/login', { replace: true });
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
            navigate('/login', { replace: true });
        },
    });
}
