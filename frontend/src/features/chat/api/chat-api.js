import { api } from '@/shared/api/client';
export const chatApi = {
    inbox: (params) => api.page('/chat', { params }),
    unread: () => api.get('/chat/unread'),
    getById: (id) => api.get(`/chat/${id}`),
    /** Newest first, and a plain array — see the note at the top of this file. */
    history: (id, params) => api.get(`/chat/${id}/messages`, { params }),
    send: (id, body) => api.post(`/chat/${id}/messages`, { body }),
    markRead: (id, at) => api.post(`/chat/${id}/read`, at ? { at } : {}),
    openCareTeam: (patientId) => api.post(`/chat/care-team/${patientId}`, {}),
    createStaffThread: (input) => api.post('/chat/staff', input),
    openDirect: (userId) => api.post('/chat/direct', { userId }),
    setArchived: (id, isArchived) => api.patch(`/chat/${id}/archive`, { isArchived }),
    addParticipant: (id, userId) => api.post(`/chat/${id}/participants`, { userId }),
    removeParticipant: (id, userId) => api.delete(`/chat/${id}/participants/${userId}`),
    deleteMessage: (messageId) => api.delete(`/chat/messages/${messageId}`),
};
