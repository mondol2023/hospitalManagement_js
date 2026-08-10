import { api } from '@/shared/api/client';
export const patientsApi = {
    list: (params) => api.page('/patients', { params }),
    /** The signed-in patient's own record. The only patients endpoint a patient may call. */
    me: () => api.get('/patients/me'),
    updateOwn: (input) => api.patch('/patients/me', input),
    getById: (patientId) => api.get(`/patients/${patientId}`),
    byMrn: (mrn) => api.get(`/patients/mrn/${encodeURIComponent(mrn)}`),
    byWard: (ward, params) => api.page(`/patients/ward/${encodeURIComponent(ward)}`, { params }),
    /** A nurse's own assigned patients. */
    caseload: (params) => api.page('/patients/caseload', { params }),
    updateClinical: (patientId, input) => api.patch(`/patients/${patientId}/clinical`, input),
    careTeam: (patientId) => api.get(`/patients/${patientId}/care-team`),
    assignNurse: (patientId, nurseUserId) => api.post(`/patients/${patientId}/nurses`, { nurseUserId }),
    removeNurse: (patientId, nurseUserId) => api.delete(`/patients/${patientId}/nurses/${nurseUserId}`),
    setPrimaryDoctor: (patientId, doctorUserId) => api.patch(`/patients/${patientId}/primary-doctor`, { doctorUserId }),
    /**
     * Releases the bed and stamps `dischargedAt`. Irreversible from the UI — the
     * screen gates it behind a ConfirmDialog.
     */
    discharge: (patientId, input) => api.post(`/patients/${patientId}/discharge`, input),
};
