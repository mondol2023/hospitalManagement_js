import { api } from '@/shared/api/client';
import type { Bed, BedStatus, BedType, WardOccupancy } from '@/shared/types/domain';

/**
 * Bed inventory and admission.
 *
 * Note what is *not* here: no "set status to occupied". A bed becomes occupied
 * by assigning a patient to it, and free by releasing that patient — the
 * housekeeping endpoint refuses `occupied` outright. Modelling it as a plain
 * status field would let the board show an occupied bed with nobody in it.
 */
export interface BedListParams {
  page?: number;
  limit?: number;
  search?: string;
  ward?: string;
  status?: BedStatus;
  type?: BedType;
}

export interface BedInventoryInput {
  bedNumber: string;
  ward: string;
  floor?: number;
  type?: BedType;
  dailyRate?: number;
  notes?: string;
}

/** Everything except `occupied` — see the note above. */
export type HousekeepingStatus = Exclude<BedStatus, 'occupied'>;

export const bedsApi = {
  list: (params?: BedListParams) => api.page<Bed>('/beds', { params }),

  available: (params?: { ward?: string; type?: BedType }) =>
    api.get<Bed[]>('/beds/available', { params }),

  occupancy: () => api.get<WardOccupancy[]>('/beds/occupancy'),

  wards: () => api.get<string[]>('/beds/wards'),

  getById: (id: string) => api.get<Bed>(`/beds/${id}`),

  create: (input: BedInventoryInput) => api.post<Bed>('/beds', input),

  update: (id: string, input: Partial<BedInventoryInput>) => api.patch<Bed>(`/beds/${id}`, input),

  remove: (id: string) => api.delete<{ id: string }>(`/beds/${id}`),

  setStatus: (id: string, status: HousekeepingStatus) =>
    api.patch<Bed>(`/beds/${id}/status`, { status }),

  assign: (id: string, patientId: string) => api.post<Bed>(`/beds/${id}/assign`, { patientId }),

  /** The id in the path is the bed the patient is moving *into*. */
  transfer: (id: string, patientId: string) => api.post<Bed>(`/beds/${id}/transfer`, { patientId }),

  /** Discharge from whichever bed the patient currently holds. */
  release: (patientId: string) => api.post<Bed>('/beds/release', { patientId }),
};
