import { api } from '@/shared/api/client';
export const bedsApi = {
    list: (params) => api.page('/beds', { params }),
    available: (params) => api.get('/beds/available', { params }),
    occupancy: () => api.get('/beds/occupancy'),
    wards: () => api.get('/beds/wards'),
    getById: (id) => api.get(`/beds/${id}`),
    create: (input) => api.post('/beds', input),
    update: (id, input) => api.patch(`/beds/${id}`, input),
    remove: (id) => api.delete(`/beds/${id}`),
    setStatus: (id, status) => api.patch(`/beds/${id}/status`, { status }),
    assign: (id, patientId) => api.post(`/beds/${id}/assign`, { patientId }),
    /** The id in the path is the bed the patient is moving *into*. */
    transfer: (id, patientId) => api.post(`/beds/${id}/transfer`, { patientId }),
    /** Discharge from whichever bed the patient currently holds. */
    release: (patientId) => api.post('/beds/release', { patientId }),
};
