import { api } from '@/shared/api/client';
export const notificationsApi = {
    list: (params) => api.page('/notifications', { params }),
    unreadCount: () => api.get('/notifications/unread-count'),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.post('/notifications/read-all'),
};
