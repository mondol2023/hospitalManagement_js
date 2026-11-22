import type { Vitals } from '@/features/patients';
import { formatDate } from '@/shared/lib/format';
import {
  refObject,
  type AppointmentStatus,
  type Bed,
  type Cents,
  type Ref,
  type User,
} from '@/shared/types/domain';

/**
 * What the patient pages say, in the patient's words. Clinical field names and
 * enum values stop here: nothing below the model layer prints `partially_paid`
 * or `systolicBp`.
 */

/** The visit statuses a patient can still be waiting on. Anything else is not "upcoming". */
export const APPOINTMENT_STATUS_WORDS: Partial<Record<AppointmentStatus, string>> = {
  pending: 'Waiting for confirmation',
  confirmed: 'Confirmed',
};

const DAY_MS = 86_400_000;

/** Midnight of the local calendar day, so "tomorrow" means the next date, not 24 hours later. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * "today", "tomorrow", "in 3 days", or a date beyond a week. The comparison is
 * by calendar day in the browser's zone: a visit at 00:30 is tomorrow even when
 * it is only an hour away.
 */
export function relativeDay(value: string, now: Date): string {
  const target = new Date(value);
  const days = Math.round((startOfDay(target) - startOfDay(now)) / DAY_MS);

  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return `on ${formatDate(target)}`;
}

interface GreetingInput {
  patient: { isAdmitted?: boolean; ward?: string; bed?: Ref<Bed> | null } | undefined;
  next: { scheduledAt: string } | null | undefined;
  now: Date;
}

/**
 * The one line under "Good morning", chosen by state in this order: admitted,
 * else a visit is booked, else nothing. The bed number is only said when the
 * bed arrived populated — a bare id is no use to a patient, so the line stops
 * at the ward rather than printing one.
 */
export function greetingLine({ patient, next, now }: GreetingInput): string | null {
  if (patient?.isAdmitted && patient.ward) {
    const bed = refObject(patient.bed)?.bedNumber;
    return bed
      ? `You're staying with us in ${patient.ward}, bed ${bed}`
      : `You're staying with us in ${patient.ward}`;
  }

  if (next) return `Your next visit is ${relativeDay(next.scheduledAt, now)}`;

  return null;
}

export interface Reading {
  label: string;
  value: string;
  unit: string;
}

const present = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The readings a visit took, ready to print. Only what is present is listed — a
 * missing reading is absent, never "0" or "—" — and a real zero (a pain score of
 * 0) is kept. There is no "normal" flag on purpose: interpreting a number is the
 * doctor's job, and a colour the doctor would not use should not alarm a patient.
 */
export function readingsOf(vitals: Vitals | undefined): Reading[] {
  if (!vitals) return [];

  const readings: Reading[] = [];

  if (present(vitals.systolicBp) && present(vitals.diastolicBp)) {
    readings.push({
      label: 'Blood pressure',
      value: `${vitals.systolicBp}/${vitals.diastolicBp}`,
      unit: 'mmHg',
    });
  } else if (present(vitals.systolicBp)) {
    readings.push({
      label: 'Blood pressure',
      value: String(vitals.systolicBp),
      unit: 'mmHg (top number)',
    });
  } else if (present(vitals.diastolicBp)) {
    readings.push({
      label: 'Blood pressure',
      value: String(vitals.diastolicBp),
      unit: 'mmHg (bottom number)',
    });
  }

  const simple: Array<[keyof Vitals, string, string]> = [
    ['heartRateBpm', 'Heart rate', 'bpm'],
    ['temperatureC', 'Temperature', '°C'],
    ['oxygenSaturation', 'Oxygen', '%'],
    ['respiratoryRate', 'Breathing', 'breaths/min'],
    ['weightKg', 'Weight', 'kg'],
    ['bloodGlucoseMgDl', 'Blood sugar', 'mg/dL'],
    ['painScore', 'Pain', 'out of 10'],
  ];

  for (const [key, label, unit] of simple) {
    const value = vitals[key];
    if (present(value)) readings.push({ label, value: String(value), unit });
  }

  return readings;
}

interface Owing {
  totalCents: Cents;
  paidCents: Cents;
  currency: string;
}

/**
 * What the patient still owes across the given bills. `balanceCents` is a
 * Mongoose virtual and never reaches a lean list response, so the balance is
 * worked out here as total − paid. An over-paid bill counts as zero, not as a
 * credit that hides another bill's debt.
 */
export function openBalance(bills: readonly Owing[]): { cents: Cents; currency: string } {
  const cents = bills.reduce((sum, bill) => sum + Math.max(bill.totalCents - bill.paidCents, 0), 0);
  return { cents, currency: bills[0]?.currency ?? 'USD' };
}

/** "Good morning" by the hour in the browser's zone. Small hours count as evening: the patient is still up, not early. */
export function salutation(now: Date): string {
  const hour = now.getHours();
  if (hour >= 6 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * A doctor's name for a patient to read. Lists never assume a `Ref` is
 * populated: a bare id, a null (the doctor's account was deleted) and a blank
 * name all become "Your doctor" rather than a crash or a raw id.
 */
export function doctorNameOf(doctor: Ref<User> | null | undefined): string {
  return refObject(doctor)?.name || 'Your doctor';
}
