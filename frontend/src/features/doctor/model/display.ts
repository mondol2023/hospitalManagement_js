import { refObject, type Patient, type Ref } from '@/shared/types/domain';

/**
 * The patient on a doctor's list, as the two strings a row shows. Lists never
 * assume a `Ref` is populated: a bare id, a null (patient deleted since the
 * record was written) and a missing name each get a plain placeholder rather
 * than a crash or a blank cell.
 */
export function partyOf(patient: Ref<Patient> | null | undefined): {
  name: string;
  mrn: string | undefined;
} {
  const populated = refObject(patient);
  if (!populated) return { name: 'Unknown patient', mrn: undefined };

  const user = refObject(populated.user);
  // No name to show: the MRN becomes the name, so it is not printed twice.
  if (!user?.name) {
    return { name: populated.medicalRecordNumber ?? 'Unknown patient', mrn: undefined };
  }
  return { name: user.name, mrn: populated.medicalRecordNumber };
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The `?date=` of "My day". A malformed or hand-edited value opens today instead of an error. */
export function dayFromParam(value: string | null, today: string): string {
  return value && isRealDay(value) ? value : today;
}

/** `YYYY-MM-DD` ± `days`. Calendar arithmetic only, so it is immune to DST shifts. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

const OPEN = new Set(['pending', 'confirmed']);

/**
 * Which row of the day is "you are here": the visit in progress, or else the
 * next one still to come. Finished and missed visits are behind the doctor
 * whatever the clock says, so they are never marked. Null when the day is over
 * or is not today.
 */
export function visitWindow(
  rows: ReadonlyArray<{ id: string; status: string; scheduledAt: string; endsAt: string }>,
  now: Date
): string | null {
  const open = rows.filter((row) => OPEN.has(row.status));
  const current = open.find(
    (row) => new Date(row.scheduledAt) <= now && now < new Date(row.endsAt)
  );
  if (current) return current.id;
  return open.find((row) => new Date(row.scheduledAt) > now)?.id ?? null;
}
