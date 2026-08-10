import { api } from '@/shared/api/client';
export const emergenciesApi = {
    /** Open to any authenticated account, staff or not — deliberately. */
    raise: (input) => api.post('/emergencies', input),
    list: (params) => api.page('/emergencies', { params }),
    activeBoard: (params) => api.page('/emergencies/active', { params }),
    countOpen: () => api.get('/emergencies/count'),
    stats: (params) => api.get('/emergencies/stats', { params }),
    listForPatient: (patientId, params) => api.page(`/emergencies/patient/${patientId}`, { params }),
    getById: (id) => api.get(`/emergencies/${id}`),
    acknowledge: (id) => api.post(`/emergencies/${id}/acknowledge`, {}),
    /** Notes are mandatory: an alert closed in silence reads as one that was ignored. */
    resolve: (id, notes) => api.post(`/emergencies/${id}/resolve`, { notes }),
    /** Severity only ever goes up; the server enforces the direction. */
    escalate: (id, severity) => api.post(`/emergencies/${id}/escalate`, { severity }),
};
