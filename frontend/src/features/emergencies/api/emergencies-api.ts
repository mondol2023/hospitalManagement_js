import { api } from '@/shared/api/client';
import type {
  Emergency,
  EmergencySeverity,
  EmergencyStatus,
  EmergencyType,
  ISODateString,
} from '@/shared/types/domain';

/**
 * The alert channel.
 *
 * Every field on `RaiseEmergencyInput` is optional, mirroring the backend's
 * loosest schema. Somebody reporting a cardiac arrest is not going to be told
 * their report is malformed because they left the room blank — so the type does
 * not let this client invent a requirement the server does not have.
 */
export interface RaiseEmergencyInput {
  type?: EmergencyType;
  severity?: EmergencySeverity;
  description?: string;
  location?: { ward?: string; floor?: number; room?: string };
  patientId?: string;
}

export interface EmergencyListParams {
  page?: number;
  limit?: number;
  status?: EmergencyStatus;
  type?: EmergencyType;
  severity?: EmergencySeverity;
  patientId?: string;
  from?: string;
  to?: string;
}

export interface ActiveBoardParams {
  page?: number;
  limit?: number;
  type?: EmergencyType;
  severity?: EmergencySeverity;
  ward?: string;
}

export interface ResponseStats {
  from: ISODateString;
  to: ISODateString;
  total: number;
  acknowledged: number;
  resolved: number;
  averageAcknowledgeSeconds: number | null;
  averageResolveSeconds: number | null;
}

export const emergenciesApi = {
  /** Open to any authenticated account, staff or not — deliberately. */
  raise: (input: RaiseEmergencyInput) => api.post<Emergency>('/emergencies', input),

  list: (params?: EmergencyListParams) => api.page<Emergency>('/emergencies', { params }),

  activeBoard: (params?: ActiveBoardParams) =>
    api.page<Emergency>('/emergencies/active', { params }),

  countOpen: () => api.get<{ count: number }>('/emergencies/count'),

  stats: (params?: { from?: string; to?: string }) =>
    api.get<ResponseStats>('/emergencies/stats', { params }),

  listForPatient: (patientId: string, params?: { page?: number; limit?: number }) =>
    api.page<Emergency>(`/emergencies/patient/${patientId}`, { params }),

  getById: (id: string) => api.get<Emergency>(`/emergencies/${id}`),

  acknowledge: (id: string) => api.post<Emergency>(`/emergencies/${id}/acknowledge`, {}),

  /** Notes are mandatory: an alert closed in silence reads as one that was ignored. */
  resolve: (id: string, notes: string) =>
    api.post<Emergency>(`/emergencies/${id}/resolve`, { notes }),

  /** Severity only ever goes up; the server enforces the direction. */
  escalate: (id: string, severity: EmergencySeverity) =>
    api.post<Emergency>(`/emergencies/${id}/escalate`, { severity }),
};
