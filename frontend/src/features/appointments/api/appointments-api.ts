import { api } from '@/shared/api/client';
import type { Appointment, AppointmentStatus, ISODateString } from '@/shared/types/domain';

/**
 * `GET /appointments` is deliberately "mine": the backend scopes the list to the
 * caller (a patient sees their own, a doctor sees theirs, an admin sees all).
 * The client never sends a "whose" parameter for that route, because the answer
 * is the session — asking the client would make it forgeable.
 */
export interface AppointmentListParams {
  page?: number;
  limit?: number;
  status?: AppointmentStatus;
  doctor?: string;
  from?: ISODateString;
  to?: ISODateString;
  sort?: string;
}

export interface BookAppointmentInput {
  /** Omitted when a patient books for themselves — the server resolves it. */
  patientId?: string;
  doctorUserId: string;
  scheduledAt: ISODateString;
  durationMinutes?: number;
  reason?: string;
}

export const appointmentsApi = {
  list: (params?: AppointmentListParams) => api.page<Appointment>('/appointments', { params }),

  byPatient: (patientId: string, params?: AppointmentListParams) =>
    api.page<Appointment>(`/appointments/patient/${patientId}`, { params }),

  byDoctor: (userId: string, params?: AppointmentListParams) =>
    api.page<Appointment>(`/appointments/doctor/${userId}`, { params }),

  /** One doctor's day, ordered — the clinic column view. */
  daySchedule: (userId: string, date: string) =>
    api.get<Appointment[]>(`/appointments/doctor/${userId}/day`, { params: { date } }),

  getById: (id: string) => api.get<Appointment>(`/appointments/${id}`),

  book: (input: BookAppointmentInput) => api.post<Appointment>('/appointments', input),

  reschedule: (id: string, input: { scheduledAt: ISODateString; durationMinutes?: number }) =>
    api.patch<Appointment>(`/appointments/${id}/reschedule`, input),

  cancel: (id: string, input?: { reason?: string }) =>
    api.post<Appointment>(`/appointments/${id}/cancel`, input ?? {}),

  confirm: (id: string) => api.post<Appointment>(`/appointments/${id}/confirm`),

  complete: (id: string, input?: { notes?: string }) =>
    api.post<Appointment>(`/appointments/${id}/complete`, input ?? {}),

  markNoShow: (id: string) => api.post<Appointment>(`/appointments/${id}/no-show`),
};
