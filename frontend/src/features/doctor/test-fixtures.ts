import type { FollowUpRow, MedicalRecord } from '@/features/patients';
import type { Page, Pagination } from '@/shared/api/envelope';
import type { Role } from '@/shared/lib/roles';
import type { User } from '@/shared/types/domain';

import type { DayAgendaRow } from '@/features/appointments';

/**
 * Shared builders for the doctor screens' tests: one hospital, described once,
 * with the populated shapes that backend changes B7–B9 and the records-list
 * population exist to produce.
 */

export function userOf(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 'u-doc',
    name: 'Dr Imani Khan',
    email: 'imani@example.com',
    role,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function pageOf<T>(items: T[], overrides: Partial<Pagination> = {}): Page<T> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1, ...overrides },
  };
}

export function patientRef(id: string, name: string) {
  return { id, medicalRecordNumber: `MRN-${id}`, user: { id: `u-${id}`, name } };
}

export function agendaRow(
  id: string,
  patientName: string,
  overrides: Partial<DayAgendaRow> = {}
): DayAgendaRow {
  return {
    id,
    scheduledAt: '2026-11-21T09:00:00.000Z',
    endsAt: '2026-11-21T09:30:00.000Z',
    durationMinutes: 30,
    status: 'confirmed',
    reason: 'Blood pressure review',
    patient: patientRef(`p-${id}`, patientName) as never,
    ...overrides,
  };
}

export function record(id: string, patientName: string, overrides: Partial<MedicalRecord> = {}) {
  return {
    id,
    patient: patientRef(`p-${id}`, patientName),
    doctor: { id: 'u-doc', name: 'Dr Imani Khan' },
    visitDate: '2026-11-18T10:00:00.000Z',
    chiefComplaint: 'Headaches for two weeks',
    diagnosis: 'Hypertension',
    treatmentPlan: 'Start amlodipine, review in a fortnight',
    prescriptions: [
      { name: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily', durationDays: 14 },
    ],
    vitals: { systolicBp: 152, diastolicBp: 96, heartRateBpm: 78 },
    notes: 'Advised less salt.',
    attachments: [],
    followUpDate: '2026-12-02T00:00:00.000Z',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  } as unknown as MedicalRecord;
}

export function followUp(
  id: string,
  patientName: string,
  overrides: Partial<FollowUpRow> = {}
): FollowUpRow {
  return {
    id,
    visitDate: '2026-11-10T10:00:00.000Z',
    followUpDate: '2026-11-24T00:00:00.000Z',
    diagnosis: 'Hypertension',
    patient: patientRef(`p-${id}`, patientName) as never,
    doctor: { id: 'u-doc', name: 'Dr Imani Khan' } as never,
    ...overrides,
  };
}

/**
 * Answers by exact path and fails loudly on anything unexpected, so a screen
 * that quietly asks for an extra endpoint shows up as a test failure rather
 * than a hung skeleton.
 */
export function routes(
  table: Record<string, unknown | ((config?: { params?: Record<string, unknown> }) => unknown)>
) {
  const handler = async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (!(path in table)) throw new Error(`Unmocked request: ${path}`);
    const answer = table[path];
    return typeof answer === 'function' ? (answer as (c?: unknown) => unknown)(config) : answer;
  };
  return handler as never;
}
