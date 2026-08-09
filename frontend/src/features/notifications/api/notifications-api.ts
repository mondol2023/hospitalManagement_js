import { api } from '@/shared/api/client';
import type { AppNotification, NotificationType } from '@/shared/types/domain';

/**
 * The notification inbox is always the caller's own.
 *
 * There is no `userId` parameter on any of these and there is no endpoint to
 * add one to — the backend puts the recipient in the query filter, so an id
 * lifted from somebody else's inbox does not match rather than 403s. Sending is
 * the one administrative door, and it is deliberately absent from this client:
 * nothing in this UI sends notifications.
 */

export interface NotificationListParams {
  page?: number;
  limit?: number;
  type?: NotificationType;
  unreadOnly?: boolean;
}

export const notificationsApi = {
  list: (params?: NotificationListParams) =>
    api.page<AppNotification>('/notifications', { params }),

  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => api.patch<AppNotification>(`/notifications/${id}/read`),

  markAllRead: () => api.post<{ modified?: number }>('/notifications/read-all'),
};
