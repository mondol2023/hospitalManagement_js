import { api } from '@/shared/api/client';
import type { ISODateString, Medicine, MedicineUnit } from '@/shared/types/domain';
import type { Role } from '@/shared/lib/roles';

/**
 * The admin pharmacy reports: what is running low, who gets told, and every
 * change to stock. Both routes are admin and manager only.
 *
 * `actor`, `by` and `medicine` are nullable because the server populates them,
 * and populate yields `null` once the referenced user or batch has been removed.
 * The type says so, so the UI has to decide what to show ("Removed user")
 * rather than crash on `.name`.
 */

export const STOCK_MOVEMENT_KINDS = [
  'restock',
  'dispense',
  'adjust',
  'administered',
  'restored',
  'withdrawn',
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export interface ActorRef {
  id: string;
  name: string;
  role: Role;
}

export interface StockReport {
  /** The server's own window. Show this, not a range computed on the client. */
  window: { from: ISODateString; to: ISODateString; days: number };
  alertRecipients: ActorRef[];
  /** Every batch at or below its reorder level right now. Not windowed. */
  lowStock: Array<
    Medicine & {
      lastRestock: { at: ISODateString; quantity: number; by: ActorRef | null } | null;
    }
  >;
  /** Windowed, top 50 by units received. */
  restockedBy: Array<{ actor: ActorRef | null; units: number; receipts: number }>;
}

export interface StockMovement {
  id: string;
  createdAt: ISODateString;
  kind: StockMovementKind;
  /** Signed: positive adds to the shelf, negative takes from it. */
  delta: number;
  /** The balance after this movement. */
  onHand: number;
  reason?: string;
  medicine: { id: string; name: string; batchNumber: string; unit: MedicineUnit } | null;
  actor: ActorRef | null;
}

export interface MovementParams {
  page?: number;
  limit?: number;
  sort?: string;
  medicine?: string;
  actor?: string;
  kind?: StockMovementKind;
  from?: ISODateString;
  /** Inclusive instant (`$lte`), so a day-only "to" must be sent as end of day. */
  to?: ISODateString;
}

export const reportsApi = {
  /** `days` is 1-365 server-side and defaults to 30 when omitted. */
  stockReport: (days?: number) =>
    api.get<StockReport>('/medicines/stock-report', { params: { days } }),

  movements: (params?: MovementParams) =>
    api.page<StockMovement>('/medicines/stock-movements', { params }),
};
