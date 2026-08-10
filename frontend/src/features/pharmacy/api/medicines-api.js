import { api } from '@/shared/api/client';
export const medicinesApi = {
    list: (params) => api.page('/medicines', { params }),
    lowStock: () => api.get('/medicines/low-stock'),
    expiring: (days) => api.get('/medicines/expiring', { params: { days } }),
    expired: () => api.get('/medicines/expired'),
    /** Deactivates every expired batch in one sweep; returns how many were pulled. */
    withdrawExpired: () => api.post('/medicines/withdraw-expired', {}),
    getById: (id) => api.get(`/medicines/${id}`),
    create: (input) => api.post('/medicines', input),
    update: (id, input) => api.patch(`/medicines/${id}`, input),
    remove: (id) => api.delete(`/medicines/${id}`),
    deactivate: (id) => api.post(`/medicines/${id}/deactivate`, {}),
    activate: (id) => api.post(`/medicines/${id}/activate`, {}),
    restock: (id, quantity) => api.post(`/medicines/${id}/restock`, { quantity }),
    dispense: (id, input) => api.post(`/medicines/${id}/dispense`, input),
    adjust: (id, input) => api.post(`/medicines/${id}/adjust`, input),
};
