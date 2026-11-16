import type { Page, Pagination } from '@/shared/api/envelope';
import type { Role } from '@/shared/lib/roles';
import type { CareLog, Patient, User } from '@/shared/types/domain';

/**
 * Shared builders for the nurse screens' tests. Kept in one place so every page
 * test describes the same hospital, and so the shape of a populated response —
 * which is the whole point of backend changes B1–B3 — is written down once.
 */

export function userOf(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 'u-nurse',
    name: 'Nia Okafor',
    email: 'nia@example.com',
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

export function nurseProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    user: 'u-nurse',
    employeeId: 'NUR-1',
    shift: 'morning',
    isOnDuty: true,
    assignedWards: ['Ward A'],
    maxPatients: 8,
    grade: 'staff_nurse',
    qualifications: 'BSN',
    experienceInYears: 4,
    joinedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function caseloadPatient(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {}
): Patient {
  return {
    id,
    user: { id: `u-${id}`, name },
    medicalRecordNumber: `MRN-${id}`,
    bed: { id: `b-${id}`, bedNumber: `12${id}`, ward: 'Ward A' },
    ward: 'Ward A',
    isAdmitted: true,
    assignedNurses: [],
    allergies: [],
    chronicConditions: [],
    ...overrides,
  } as unknown as Patient;
}

export function attentionLog(
  id: string,
  patientName: string,
  overrides: Record<string, unknown> = {}
): CareLog {
  return {
    id,
    type: 'observation',
    patient: {
      id: `p-${id}`,
      medicalRecordNumber: `MRN-${id}`,
      user: { id: `pu-${id}`, name: patientName },
    },
    recordedBy: { id: 'u-other', name: 'Sam Reyes', role: 'nurse' },
    ward: 'Ward A',
    notes: 'Breathing looks laboured',
    requiresAttention: true,
    performedAt: '2026-11-16T08:00:00.000Z',
    createdAt: '2026-11-16T08:00:00.000Z',
    ...overrides,
  } as unknown as CareLog;
}

/**
 * Builds a mock implementation that answers by exact path and fails loudly on
 * anything unexpected, so a screen that quietly asks for an extra endpoint
 * shows up as a test failure rather than a hung skeleton.
 */
export function routes(
  table: Record<string, unknown | ((config?: { params?: Record<string, unknown> }) => unknown)>
) {
  const handler = async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (!(path in table)) throw new Error(`Unmocked request: ${path}`);
    const answer = table[path];
    return typeof answer === 'function' ? (answer as (c?: unknown) => unknown)(config) : answer;
  };
  // Assignable to any typed mock: the table is the contract, not the generic.
  return handler as never;
}
