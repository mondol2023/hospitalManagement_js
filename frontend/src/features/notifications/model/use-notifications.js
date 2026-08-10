import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { useSocketEvent } from '@/shared/realtime/useSocketEvent';
import { toast } from '@/shared/ui';
import { notificationsApi } from '../api/notifications-api';
export function useNotifications(params) {
    return useQuery({
        queryKey: queryKeys.notifications.list(params),
        queryFn: () => notificationsApi.list(params),
        placeholderData: (previous) => previous,
    });
}
/**
 * The bell's badge.
 *
 * Polled on a minute as well as pushed over the socket, because the badge is
 * the one number a user reads as authoritative — if the socket has quietly
 * dropped, a stale zero is worse than a request a minute.
 */
export function useUnreadNotificationCount(enabled = true) {
    return useQuery({
        queryKey: queryKeys.notifications.unreadCount,
        queryFn: () => notificationsApi.unreadCount(),
        refetchInterval: 60_000,
        enabled,
    });
}
/**
 * Applies pushed notifications and raises a toast for the ones worth
 * interrupting for.
 *
 * Emergencies toast; everything else lands silently in the inbox. A toast is an
 * interruption, and a system that interrupts for a billing receipt trains people
 * to dismiss the one that says a patient is arresting.
 */
export function useNotificationStream() {
    const queryClient = useQueryClient();
    const onNotification = useCallback((notification) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        if (notification.type === 'emergency') {
            toast.error(notification.title);
        }
    }, [queryClient]);
    useSocketEvent('notification:new', onNotification);
}
export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => notificationsApi.markRead(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
        // Silent on failure, like chat read receipts: housekeeping the reader
        // cannot act on.
    });
}
export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => notificationsApi.markAllRead(),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : 'Could not mark those as read');
        },
    });
}
