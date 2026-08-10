import { api } from '@/shared/api/client';
export const careLogsApi = {
    byPatient: (patientId, params) => api.page(`/care-logs/patient/${patientId}`, { params }),
    latestVitals: (patientId) => api.get(`/care-logs/patient/${patientId}/vitals/latest`),
    /** Logs flagged `requiresAttention` and not yet acknowledged. */
    attention: (params) => api.page('/care-logs/attention', { params }),
    byWard: (ward) => api.page(`/care-logs/ward/${encodeURIComponent(ward)}`),
    logVitals: (input) => api.post('/care-logs/vitals', input),
    logMedication: (input) => api.post('/care-logs/medications', input),
    logObservation: (input) => api.post('/care-logs/observations', input),
    logService: (input) => api.post('/care-logs/services', input),
    logProcedure: (input) => api.post('/care-logs/procedures', input),
    logHandover: (input) => api.post('/care-logs/handovers', input),
    acknowledge: (logId) => api.post(`/care-logs/${logId}/acknowledge`),
    /**
     * Care logs are an audit trail, so they are corrected, never edited — the
     * backend keeps the original and appends the correction.
     */
    correct: (logId, input) => api.post(`/care-logs/${logId}/correct`, input),
};
export const medicalRecordsApi = {
    byPatient: (patientId, params) => api.page(`/medical-records/patient/${patientId}`, { params }),
    latest: (patientId) => api.get(`/medical-records/patient/${patientId}/latest`),
    /** The signed-in patient's own history. */
    mine: (params) => api.page('/medical-records/me', { params }),
    followUps: (params) => api.page('/medical-records/follow-ups', { params }),
    getById: (id) => api.get(`/medical-records/${id}`),
    create: (input) => api.post('/medical-records', input),
    update: (id, input) => api.patch(`/medical-records/${id}`, input),
    remove: (id) => api.delete(`/medical-records/${id}`),
};
