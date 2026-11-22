import type { Attachment, MedicalRecord, Prescription } from '@/features/patients';

/**
 * The care journey as the patient reads it: a newest-first list of visits, with
 * the year said once where it changes and the next follow-up kept apart at the
 * top. Clinical field names stop here.
 */

export interface JourneyEntry {
  record: MedicalRecord;
  /** "2025" on the first visit of a new year as the list is read downward; otherwise null. */
  yearMark: string | null;
}

/**
 * Marks each change of year. The first visit counts against the current year, so
 * a patient whose latest visit was last year sees "2025" above it rather than
 * having to infer it from the date.
 */
export function withYearMarks(records: readonly MedicalRecord[], now: Date): JourneyEntry[] {
  let previous = now.getFullYear();

  return records.map((record) => {
    const year = new Date(record.visitDate).getFullYear();
    const yearMark = year === previous ? null : String(year);
    previous = year;
    return { record, yearMark };
  });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The soonest "come back on" date that has not passed. A follow-up due today is
 * still to come: the day is the unit, not the minute, so it does not vanish at
 * midnight plus one second.
 */
export function nextFollowUp(records: readonly MedicalRecord[], now: Date): MedicalRecord | null {
  const today = startOfDay(now);
  let soonest: { record: MedicalRecord; at: number } | null = null;

  for (const record of records) {
    if (!record.followUpDate) continue;
    const at = new Date(record.followUpDate).getTime();
    if (Number.isNaN(at) || at < today) continue;
    if (!soonest || at < soonest.at) soonest = { record, at };
  }

  return soonest?.record ?? null;
}

export interface MedicineLine {
  name: string;
  /** "500 mg · Three times a day · for 7 days", with whatever is missing left out. */
  summary: string;
  instructions: string | undefined;
}

export function prescriptionLine(
  prescription: Pick<
    Prescription,
    'name' | 'dosage' | 'frequency' | 'durationDays' | 'instructions'
  >
): MedicineLine {
  const days = prescription.durationDays;
  const parts = [
    prescription.dosage,
    prescription.frequency,
    days ? `for ${days} ${days === 1 ? 'day' : 'days'}` : undefined,
  ].filter(Boolean);

  return {
    name: prescription.name,
    summary: parts.join(' · '),
    instructions: prescription.instructions,
  };
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif)(?:$|[?#])/i;

/** An image gets a thumbnail; anything else (a PDF, an unknown type) gets a file icon. */
export function attachmentKind(attachment: Pick<Attachment, 'url' | 'mimeType'>): 'image' | 'file' {
  if (attachment.mimeType) return attachment.mimeType.startsWith('image/') ? 'image' : 'file';
  return IMAGE_EXTENSION.test(attachment.url) ? 'image' : 'file';
}
