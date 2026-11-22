import { describe, expect, it } from 'vitest';

import type { MedicalRecord } from '@/features/patients';
import type { User } from '@/shared/types/domain';

import { attachmentKind, nextFollowUp, prescriptionLine, withYearMarks } from './journey';

function record(
  id: string,
  visitDate: Date,
  overrides: Partial<MedicalRecord> = {}
): MedicalRecord {
  return {
    id,
    patient: 'p-amina',
    doctor: { id: 'u-doc', name: 'Dr Rao' } as User,
    visitDate: visitDate.toISOString(),
    diagnosis: 'Chest infection',
    createdAt: visitDate.toISOString(),
    updatedAt: visitDate.toISOString(),
    ...overrides,
  };
}

const NOW = new Date(2026, 10, 22, 9, 0);

describe('withYearMarks', () => {
  it('marks a visit only when its year differs from the one above it', () => {
    const entries = withYearMarks(
      [
        record('a', new Date(2026, 10, 3)),
        record('b', new Date(2026, 4, 1)),
        record('c', new Date(2025, 8, 14)),
        record('d', new Date(2025, 1, 2)),
        record('e', new Date(2024, 0, 9)),
      ],
      NOW
    );

    expect(entries.map((e) => e.yearMark)).toEqual([null, null, '2025', null, '2024']);
  });

  it('marks the first visit when it is not from the current year', () => {
    const entries = withYearMarks([record('a', new Date(2025, 8, 14))], NOW);

    expect(entries[0]?.yearMark).toBe('2025');
  });

  it('keeps the records in the order given', () => {
    const entries = withYearMarks(
      [record('a', new Date(2026, 1, 1)), record('b', new Date(2026, 0, 1))],
      NOW
    );

    expect(entries.map((e) => e.record.id)).toEqual(['a', 'b']);
  });
});

describe('nextFollowUp', () => {
  it('returns the soonest follow-up that is not in the past', () => {
    const records = [
      record('late', new Date(2026, 10, 3), { followUpDate: new Date(2026, 11, 20).toISOString() }),
      record('soon', new Date(2026, 9, 3), { followUpDate: new Date(2026, 10, 28).toISOString() }),
      record('gone', new Date(2026, 8, 3), { followUpDate: new Date(2026, 9, 1).toISOString() }),
      record('none', new Date(2026, 7, 3)),
    ];

    expect(nextFollowUp(records, NOW)?.id).toBe('soon');
  });

  it('counts a follow-up due today as still to come', () => {
    const today = record('today', new Date(2026, 10, 1), {
      followUpDate: new Date(2026, 10, 22, 0, 0).toISOString(),
    });

    expect(nextFollowUp([today], NOW)?.id).toBe('today');
  });

  it('is null when nothing is due', () => {
    expect(nextFollowUp([record('a', new Date(2026, 10, 3))], NOW)).toBeNull();
    expect(nextFollowUp([], NOW)).toBeNull();
  });
});

describe('prescriptionLine', () => {
  it('joins dose, how often and how long in the patient’s words', () => {
    expect(
      prescriptionLine({
        name: 'Amoxicillin',
        dosage: '500 mg',
        frequency: 'Three times a day',
        durationDays: 7,
      })
    ).toEqual({
      name: 'Amoxicillin',
      summary: '500 mg · Three times a day · for 7 days',
      instructions: undefined,
    });
  });

  it('says "1 day" in the singular and skips what is missing', () => {
    expect(prescriptionLine({ name: 'Ibuprofen', dosage: '200 mg', durationDays: 1 }).summary).toBe(
      '200 mg · for 1 day'
    );
    expect(prescriptionLine({ name: 'Ibuprofen', dosage: '200 mg' }).summary).toBe('200 mg');
  });

  it('passes the instructions through', () => {
    expect(
      prescriptionLine({ name: 'Ibuprofen', dosage: '200 mg', instructions: 'Take with food' })
        .instructions
    ).toBe('Take with food');
  });
});

describe('attachmentKind', () => {
  it('is an image by its type, or by its extension when the type is missing', () => {
    expect(attachmentKind({ url: '/u/scan', mimeType: 'image/png' })).toBe('image');
    expect(attachmentKind({ url: 'https://files.example/x-ray.JPG' })).toBe('image');
  });

  it('is a file for a PDF or anything unknown', () => {
    expect(attachmentKind({ url: '/u/report.pdf', mimeType: 'application/pdf' })).toBe('file');
    expect(attachmentKind({ url: '/u/report' })).toBe('file');
  });
});
