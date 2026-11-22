import { api } from '@/shared/api/client';
import type {
  Appointment,
  AppointmentStatus,
  ISODateString,
  PatientSummary,
  Ref,
  UserSummary,
} from '@/shared/types/domain';

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
  /**
   * Visits still ahead: `pending` or `confirmed`, from now on, soonest first.
   * Overrides `status` and `sort`. "Now" is the server's, not the browser's.
   */
  upcoming?: boolean;
}

export interface BookAppointmentInput {
  /** Omitted when a patient books for themselves — the server resolves it. */
  patientId?: string;
  doctorUserId: string;
  scheduledAt: ISODateString;
  durationMinutes?: number;
  reason?: string;
}

/**
 * A row of the doctor's day. Not a full `Appointment`: there is no `doctor` (it
 * is the caller) and no timestamps. `patient` carries the MRN and, inside it,
 * the user's name — but stays a `Ref`, so a deleted patient renders as a
 * placeholder rather than crashing the list.
 */
export type DayAgendaRow = Pick<
  Appointment,
  'id' | 'scheduledAt' | 'endsAt' | 'durationMinutes' | 'status' | 'reason' | 'patient'
>;

/**
 * A row of the hospital-wide list a staff member (not a doctor) sees. The
 * staff branch populates the doctor's name and the patient's MRN with the
 * user's name inside it, which is what lets the front desk show who is coming
 * without a request per row. Every populated ref stays nullable: a deleted
 * doctor or patient must not crash the list.
 */
export type ArrivalAppointment = Omit<Appointment, 'patient' | 'doctor'> & {
  patient: Ref<PatientSummary> | null;
  doctor: Ref<UserSummary> | null;
};

export const appointmentsApi = {
  list: (params?: AppointmentListParams) => api.page<Appointment>('/appointments', { params }),

  /** The same route as `list`, typed for the staff branch's populated rows. */
  arrivals: (params: AppointmentListParams) =>
    api.page<ArrivalAppointment>('/appointments', { params }),

  byPatient: (patientId: string, params?: AppointmentListParams) =>
    api.page<Appointment>(`/appointments/patient/${patientId}`, { params }),

  byDoctor: (userId: string, params?: AppointmentListParams) =>
    api.page<Appointment>(`/appointments/doctor/${userId}`, { params }),

  /**
   * One doctor's day, ordered by time. `date` is `YYYY-MM-DD`; the backend cuts
   * days at UTC midnight. Finished visits are left out unless `includeClosed`.
   */
  daySchedule: (userId: string, date: string, { includeClosed = false } = {}) =>
    api.get<DayAgendaRow[]>(`/appointments/doctor/${userId}/day`, {
      params: includeClosed ? { date, includeClosed } : { date },
    }),

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
