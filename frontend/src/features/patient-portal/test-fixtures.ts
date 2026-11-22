import type { CareTeamProfile, MedicalRecord } from '@/features/patients';
import type { Page, Pagination } from '@/shared/api/envelope';
import type { Appointment, Bill, Patient, User } from '@/shared/types/domain';

/**
 * Shared builders for the patient pages' tests: one patient, Amina Yusuf,
 * described once, in the shapes the `me` routes actually send. Written for this
 * slice alone — features do not import each other's fixtures.
 */

export function patientUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-amina',
    name: 'Amina Yusuf',
    email: 'amina@example.com',
    role: 'patient',
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

/** `/patients/me` sends the record with `primaryDoctor`, `assignedNurses` and `bed` as bare ids. */
export function myPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p-amina',
    user: 'u-amina',
    medicalRecordNumber: 'MRN-0001',
    age: 34,
    gender: 'female',
    allergies: [],
    chronicConditions: [],
    emergencyContact: { name: 'Sam Yusuf', relationship: 'Brother', phone: '555-0100' },
    primaryDoctor: 'u-doc',
    assignedNurses: [],
    isAdmitted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function appointment(id: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id,
    patient: 'p-amina',
    doctor: { id: 'u-doc', name: 'Dr Imani Khan', email: 'imani@example.com' } as User,
    scheduledAt: new Date(2026, 10, 24, 10, 30).toISOString(),
    durationMinutes: 30,
    endsAt: new Date(2026, 10, 24, 11, 0).toISOString(),
    status: 'confirmed',
    reason: 'Blood pressure review',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

export function careTeam(overrides: Partial<CareTeamProfile> = {}): CareTeamProfile {
  return {
    primaryDoctor: {
      id: 'u-doc',
      name: 'Dr Imani Khan',
      specialization: 'Cardiology',
      department: 'Heart centre',
    },
    nurses: [
      { id: 'u-n1', name: 'Bea Arthur' },
      { id: 'u-n2', name: 'Cy Young' },
    ],
    ...overrides,
  };
}

export function vitalsRecord(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 'r1',
    patient: 'p-amina',
    doctor: { id: 'u-doc', name: 'Dr Imani Khan' } as User,
    visitDate: new Date(2026, 10, 18, 10, 0).toISOString(),
    diagnosis: 'Hypertension',
    vitals: { systolicBp: 152, diastolicBp: 96, heartRateBpm: 78 },
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

export function bill(
  id: string,
  totalCents: number,
  paidCents: number,
  overrides: Partial<Bill> = {}
): Bill {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    patient: 'p-amina',
    items: [],
    subtotalCents: totalCents,
    taxCents: 0,
    discountCents: 0,
    totalCents,
    paidCents,
    currency: 'USD',
    status: paidCents > 0 ? 'partially_paid' : 'unpaid',
    payments: [],
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Answers by exact path and fails loudly on anything unexpected, so a screen
 * that quietly asks for a staff-only endpoint (or an extra one) shows up as a
 * test failure rather than a hung skeleton.
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
