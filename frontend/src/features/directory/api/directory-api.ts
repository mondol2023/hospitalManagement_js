import { api } from '@/shared/api/client';
import type { Cents, ISODateString, Ref, User } from '@/shared/types/domain';

/**
 * The staff directory: doctor, nurse and staff *profiles*.
 *
 * A profile is not a user. `User` carries identity and role; the profile
 * carries employment (`employeeId`, department, shift, duty state) and the
 * professional detail specific to the role. Appointments reference the doctor's
 * **user** id, not the profile id — hence `byUser` on every one of these.
 */

export interface StaffProfileCore {
  id: string;
  user: Ref<User>;
  employeeId: string;
  department?: string;
  shift: string;
  isOnDuty: boolean;
  joinedAt: ISODateString;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface TimeSlot {
  /** `HH:mm`, 24-hour. */
  start: string;
  end: string;
}

export interface Doctor extends StaffProfileCore {
  specialization: string;
  qualifications: string;
  licenseNumber?: string;
  experienceInYears: number;
  consultationFeeCents: Cents;
  availableDays: string[];
  timeSlots: TimeSlot[];
  slotDurationMinutes: number;
  isAcceptingPatients: boolean;
}

export interface Nurse extends StaffProfileCore {
  assignedWards: string[];
  qualifications: string;
  licenseNumber?: string;
  experienceInYears: number;
  grade: 'trainee' | 'staff_nurse' | 'senior_nurse' | 'head_nurse';
  supervisor?: Ref<User>;
  maxPatients: number;
}

/**
 * A row of the on-duty list: a trimmed projection, not a full nurse profile.
 * `user` carries the name; use it as the receiver's id for a handover.
 */
export interface OnDutyNurse {
  id: string;
  user: Pick<User, 'id' | 'name'>;
  assignedWards: string[];
  grade: Nurse['grade'];
}

export interface StaffMember extends StaffProfileCore {
  /** The backend's name for a job title. */
  designation: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'intern';
  reportsTo?: Ref<User>;
  notes?: string;
}

/**
 * Availability is *derived* server-side from the doctor's working pattern minus
 * live appointments, so the client never caches it long and never tries to
 * compute it. Only free slots come back.
 */
export interface AvailabilitySlot {
  startsAt: ISODateString;
  endsAt: ISODateString;
  available: boolean;
}

export interface DoctorAvailability {
  date: ISODateString;
  slotDurationMinutes: number;
  slots: AvailabilitySlot[];
}

export interface DirectoryParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  specialization?: string;
}

export const directoryApi = {
  doctors: (params?: DirectoryParams) => api.page<Doctor>('/doctors', { params }),

  specializations: () => api.get<string[]>('/doctors/specializations'),

  doctorByUser: (userId: string) => api.get<Doctor>(`/doctors/by-user/${userId}`),

  availability: (userId: string, date: string) =>
    api.get<DoctorAvailability>(`/doctors/by-user/${userId}/availability`, { params: { date } }),

  nurses: (params?: DirectoryParams) => api.page<Nurse>('/nurses', { params }),

  nursesOnDuty: (ward: string) =>
    api.get<OnDutyNurse[]>(`/nurses/ward/${encodeURIComponent(ward)}/on-duty`),

  staff: (params?: DirectoryParams) => api.page<StaffMember>('/staff', { params }),
};
