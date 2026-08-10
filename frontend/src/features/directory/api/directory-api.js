import { api } from '@/shared/api/client';
export const directoryApi = {
    doctors: (params) => api.page('/doctors', { params }),
    specializations: () => api.get('/doctors/specializations'),
    doctorByUser: (userId) => api.get(`/doctors/by-user/${userId}`),
    availability: (userId, date) => api.get(`/doctors/by-user/${userId}/availability`, { params: { date } }),
    nurses: (params) => api.page('/nurses', { params }),
    nursesOnDuty: (ward) => api.get(`/nurses/ward/${encodeURIComponent(ward)}/on-duty`),
    staff: (params) => api.page('/staff', { params }),
};
