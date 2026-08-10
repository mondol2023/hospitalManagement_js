import { api } from '@/shared/api/client';
export const appointmentsApi = {
    list: (params) => api.page('/appointments', { params }),
    byPatient: (patientId, params) => api.page(`/appointments/patient/${patientId}`, { params }),
    byDoctor: (userId, params) => api.page(`/appointments/doctor/${userId}`, { params }),
    /** One doctor's day, ordered — the clinic column view. */
    daySchedule: (userId, date) => api.get(`/appointments/doctor/${userId}/day`, { params: { date } }),
    getById: (id) => api.get(`/appointments/${id}`),
    book: (input) => api.post('/appointments', input),
    reschedule: (id, input) => api.patch(`/appointments/${id}/reschedule`, input),
    cancel: (id, input) => api.post(`/appointments/${id}/cancel`, input ?? {}),
    confirm: (id) => api.post(`/appointments/${id}/confirm`),
    complete: (id, input) => api.post(`/appointments/${id}/complete`, input ?? {}),
    markNoShow: (id) => api.post(`/appointments/${id}/no-show`),
};
