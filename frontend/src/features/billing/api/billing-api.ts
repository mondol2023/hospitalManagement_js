import { api } from '@/shared/api/client';
import type {
  Bill,
  BillStatus,
  Cents,
  ISODateString,
  PaymentMethod,
} from '@/shared/types/domain';

/**
 * Invoicing and collection.
 *
 * Every amount crossing this boundary is an integer number of cents. Nothing in
 * this slice ever sends a float: `12.5` is not twelve and a half cents, it is a
 * client that has sent dollars to a cents field, and the backend rejects it with
 * a 422 rather than quietly rounding. Amounts are parsed from the operator's
 * typing exactly once, by `parseMoneyToCents`, at the form edge.
 *
 * `totalCents`, `paidCents`, `status` and `invoiceNumber` are absent from every
 * input type: the first three are derived from the line items server-side, and
 * the fourth is the document's identity.
 */
export interface BillListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: BillStatus;
  patientId?: string;
  overdue?: boolean;
}

export interface LineItemInput {
  description: string;
  code?: string;
  quantity?: number;
  unitPriceCents: Cents;
}

/** The terms that can ride along with a newly raised or swept-up invoice. */
export interface BillTerms {
  taxCents?: Cents;
  discountCents?: Cents;
  dueDate?: ISODateString;
  notes?: string;
  /** Drafts stay off the patient's outstanding list until someone issues them. */
  isDraft?: boolean;
}

export interface CreateBillInput extends BillTerms {
  patientId: string;
  items: LineItemInput[];
  currency?: string;
}

export interface UpdateBillInput {
  /** Replaced wholesale — a partial edit of a priced list is ambiguous. */
  items?: LineItemInput[];
  taxCents?: Cents;
  discountCents?: Cents;
  dueDate?: ISODateString;
  notes?: string;
}

export interface PaymentInput {
  amountCents: Cents;
  method: PaymentMethod;
  transactionId?: string;
}

export interface RefundInput {
  /** Which payment is being reversed. */
  transactionId: string;
  /** Omitted means "reverse it in full" — the common case. */
  amountCents?: Cents;
  reason?: string;
}

export interface RevenueSummary {
  from: ISODateString;
  to: ISODateString;
  billedCents: Cents;
  collectedCents: Cents;
  outstandingCents: Cents;
  count: number;
  byStatus: Partial<
    Record<BillStatus, { billedCents: Cents; collectedCents: Cents; count: number }>
  >;
}

export const billingApi = {
  list: (params?: BillListParams) => api.page<Bill>('/bills', { params }),

  outstanding: (params?: { page?: number; limit?: number }) =>
    api.page<Bill>('/bills/outstanding', { params }),

  revenue: (params?: { from?: string; to?: string }) =>
    api.get<RevenueSummary>('/bills/revenue', { params }),

  /**
   * What this deployment can actually take money through — not the enum. A
   * deployment with no Stripe key must never offer a button that can only 503.
   */
  paymentMethods: () => api.get<PaymentMethod[]>('/bills/payment-methods'),

  getById: (id: string) => api.get<Bill>(`/bills/${id}`),

  getByInvoiceNumber: (invoiceNumber: string) =>
    api.get<Bill>(`/bills/invoice/${invoiceNumber}`),

  listForPatient: (patientId: string, params?: { page?: number; limit?: number; status?: BillStatus }) =>
    api.page<Bill>(`/bills/patient/${patientId}`, { params }),

  /** Sweeps the patient's unbilled chargeable care onto one invoice. */
  buildFromCare: (patientId: string, terms?: BillTerms) =>
    api.post<Bill>(`/bills/patient/${patientId}/from-care`, terms ?? {}),

  create: (input: CreateBillInput) => api.post<Bill>('/bills', input),

  update: (id: string, input: UpdateBillInput) => api.patch<Bill>(`/bills/${id}`, input),

  addItems: (id: string, items: LineItemInput[]) => api.post<Bill>(`/bills/${id}/items`, { items }),

  issue: (id: string) => api.post<Bill>(`/bills/${id}/issue`, {}),

  void: (id: string, reason?: string) =>
    api.post<Bill>(`/bills/${id}/void`, reason ? { reason } : {}),

  pay: (id: string, input: PaymentInput) => api.post<Bill>(`/bills/${id}/payments`, input),

  refund: (id: string, input: RefundInput) => api.post<Bill>(`/bills/${id}/refunds`, input),
};
