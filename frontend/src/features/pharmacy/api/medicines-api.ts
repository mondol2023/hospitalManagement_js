import { api } from '@/shared/api/client';
import type { ISODateString, Medicine, MedicineUnit } from '@/shared/types/domain';

/**
 * The pharmacy catalogue and its stock movements.
 *
 * `quantity` appears on `create` and nowhere else, mirroring the backend
 * validator: once a batch exists its count moves only through restock, dispense
 * or adjust, each an atomic increment that records why. A PATCH that could set
 * the number outright would silently overwrite whatever movements landed while
 * the form was open — so the type makes that unsayable rather than leaving it to
 * a reviewer to notice.
 *
 * `price` here is a plain major-unit number on the medicine model, not cents.
 * That is the backend's shape; it is converted for display at the render edge
 * and never mixed with the billing amounts, which are cents throughout.
 */
export interface MedicineListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  requiresPrescription?: boolean;
  isActive?: boolean;
  includeInactive?: boolean;
}

/** The catalogue fields — what a batch *is*, as opposed to how much of it there is. */
export interface MedicineCatalogueInput {
  name: string;
  genericName?: string;
  batchNumber: string;
  category?: string;
  unit?: MedicineUnit;
  reorderLevel?: number;
  manufacturer?: string;
  expiryDate: ISODateString;
  description?: string;
  requiresPrescription?: boolean;
}

export interface CreateMedicineInput extends MedicineCatalogueInput {
  price: number;
  /** The opening count. Every later change is a movement, not an edit. */
  quantity?: number;
}

export type UpdateMedicineInput = Partial<MedicineCatalogueInput> & {
  price?: number;
  isActive?: boolean;
};

/** A stock-take correction: signed, and the reason is not optional. */
export interface AdjustInput {
  delta: number;
  reason: string;
}

export const medicinesApi = {
  list: (params?: MedicineListParams) => api.page<Medicine>('/medicines', { params }),

  lowStock: () => api.get<Medicine[]>('/medicines/low-stock'),

  expiring: (days?: number) => api.get<Medicine[]>('/medicines/expiring', { params: { days } }),

  expired: () => api.get<Medicine[]>('/medicines/expired'),

  /** Deactivates every expired batch in one sweep; returns how many were pulled. */
  withdrawExpired: () => api.post<{ withdrawn: number }>('/medicines/withdraw-expired', {}),

  getById: (id: string) => api.get<Medicine>(`/medicines/${id}`),

  create: (input: CreateMedicineInput) => api.post<Medicine>('/medicines', input),

  update: (id: string, input: UpdateMedicineInput) =>
    api.patch<Medicine>(`/medicines/${id}`, input),

  remove: (id: string) => api.delete<{ id: string }>(`/medicines/${id}`),

  deactivate: (id: string) => api.post<Medicine>(`/medicines/${id}/deactivate`, {}),

  activate: (id: string) => api.post<Medicine>(`/medicines/${id}/activate`, {}),

  restock: (id: string, quantity: number) =>
    api.post<Medicine>(`/medicines/${id}/restock`, { quantity }),

  dispense: (id: string, input: { quantity: number; reason?: string }) =>
    api.post<Medicine>(`/medicines/${id}/dispense`, input),

  adjust: (id: string, input: AdjustInput) => api.post<Medicine>(`/medicines/${id}/adjust`, input),
};
