import type { OutstandingBill, RevenueSummary } from '@/features/billing';
import { isPast } from '@/shared/lib/hospital-day';
import { refObject, type PatientSummary, type Ref, type UserSummary } from '@/shared/types/domain';

/** What a row says when the patient's user record is gone (data repair case). */
export const NAME_NOT_ON_RECORD = 'Name not on record';

/**
 * A patient on an arrivals row, as two strings. Every populated ref stays
 * nullable on the wire, so a deleted user or patient gets a plain placeholder
 * instead of a crash. The MRN is kept apart from the name so the row can set it
 * in the identifier face.
 */
export function patientLabel(patient: Ref<PatientSummary> | null | undefined): {
  name: string;
  mrn: string | undefined;
} {
  const populated = refObject(patient);
  const user = refObject(populated?.user);
  return {
    name: user?.name ?? NAME_NOT_ON_RECORD,
    mrn: populated?.medicalRecordNumber,
  };
}

/** What an outstanding bill's status column says. */
export type OwingState = 'overdue' | 'partially_paid' | 'unpaid';

/**
 * Overdue wins over part paid: a half-paid bill that is past due is still one
 * someone has to chase. A bill with no due date can never be overdue.
 */
export function owingState(bill: OutstandingBill, now: Date): OwingState {
  if (isPast(bill.dueDate, now)) return 'overdue';
  return bill.status === 'partially_paid' ? 'partially_paid' : 'unpaid';
}

/** Unpaid and part-paid bills raised in the window: the two that still owe money. */
export function openBills(summary: RevenueSummary): number {
  return (summary.byStatus.unpaid?.count ?? 0) + (summary.byStatus.partially_paid?.count ?? 0);
}

/** A batch this close to its date carries an "Expires soon" badge. */
export const EXPIRES_SOON_DAYS = 7;

/**
 * Calendar days from today to `date` on the local clock: 0 for "later today",
 * 1 for "tomorrow". Counting calendar days, not 24-hour blocks, is what keeps a
 * batch dated tomorrow from reading "today" at 9 p.m. and "in 2 days" at 9 a.m.
 */
export function daysToExpiry(date: string | Date, now: Date = new Date()): number {
  const target = date instanceof Date ? date : new Date(date);
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((day(target) - day(now)) / 86_400_000);
}

export function expiresIn(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * "120 capsules", "1 vial", "40 ml". A bare "40" is ambiguous (tablets, or
 * millilitres?), and "120 capsule" reads like a typo. Measures (ml, mg) stay as
 * they are.
 */
export function quantityLabel(quantity: number, unit: string): string {
  const measure = unit === 'ml' || unit === 'mg';
  return `${quantity} ${measure || quantity === 1 ? unit : `${unit}s`}`;
}

export function doctorLabel(doctor: Ref<UserSummary> | null | undefined): string | null {
  return refObject(doctor)?.name ?? null;
}
