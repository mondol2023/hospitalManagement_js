import type { ArrivalAppointment } from '@/features/appointments';
import type { OutstandingBill } from '@/features/billing';
import type { PatientWithName } from '@/features/patients';
import type { ExpiryBatch } from '@/features/pharmacy';
import type { Page, Pagination } from '@/shared/api/envelope';
import type { Role } from '@/shared/lib/roles';
import type { Bed, User } from '@/shared/types/domain';

/**
 * Shared builders for the operations screens' tests: one hospital, described
 * once, with the populated shapes that backend changes B13 to B15 exist to
 * produce (names on the MRN lookup, the arrivals list and the outstanding list).
 */

export function userOf(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 'u-desk',
    name: 'Sam Okoye',
    email: 'sam@example.com',
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

export function arrival(
  id: string,
  patientName: string | null,
  overrides: Partial<ArrivalAppointment> = {}
): ArrivalAppointment {
  return {
    id,
    patient: {
      id: `p-${id}`,
      medicalRecordNumber: `MRN-${id.toUpperCase()}`,
      user: patientName === null ? null : { id: `u-${id}`, name: patientName },
    },
    doctor: { id: 'd-rao', name: 'Dr Rao' },
    scheduledAt: '2026-11-22T09:00:00.000Z',
    endsAt: '2026-11-22T09:30:00.000Z',
    durationMinutes: 30,
    status: 'pending',
    reason: 'Review',
    createdAt: '2026-11-20T09:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
    ...overrides,
  } as ArrivalAppointment;
}

export function bed(id: string, ward: string, overrides: Partial<Bed> = {}): Bed {
  return {
    id,
    bedNumber: `${ward[0]}-${id}`,
    ward,
    type: 'general',
    status: 'available',
    dailyRate: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Bed;
}

export function patientWithName(
  name: string | null,
  overrides: Partial<PatientWithName> = {}
): PatientWithName {
  return {
    id: 'p-1',
    user: name === null ? null : { id: 'u-p1', name },
    medicalRecordNumber: 'MRN-004213',
    dateOfBirth: '1988-03-04T00:00:00.000Z',
    age: 38,
    gender: 'female',
    allergies: [],
    chronicConditions: [],
    emergencyContact: { name: 'Kin', phone: '000', relationship: 'sibling' },
    assignedNurses: [],
    isAdmitted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PatientWithName;
}

/**
 * A row of `/bills/outstanding`, populated as backend change B15 makes it: the
 * patient carries the MRN and the user's name. Pass `null` for the name to get
 * the data-repair case (a patient whose user record is gone).
 */
export function outstandingBill(
  id: string,
  patientName: string | null,
  overrides: Partial<OutstandingBill> = {}
): OutstandingBill {
  return {
    id,
    invoiceNumber: `INV-2026-${id.toUpperCase()}`,
    patient: {
      id: `p-${id}`,
      medicalRecordNumber: `MRN-${id.toUpperCase()}`,
      user: patientName === null ? null : { id: `u-${id}`, name: patientName },
    },
    items: [],
    subtotalCents: 50_000,
    taxCents: 0,
    discountCents: 0,
    totalCents: 50_000,
    paidCents: 0,
    currency: 'USD',
    status: 'unpaid',
    payments: [],
    dueDate: '2026-12-15T00:00:00.000Z',
    createdAt: '2026-10-03T08:00:00.000Z',
    updatedAt: '2026-10-03T08:00:00.000Z',
    ...overrides,
  };
}

export function batch(
  id: string,
  expiryDate: string,
  overrides: Partial<ExpiryBatch> = {}
): ExpiryBatch {
  return {
    id,
    name: `Medicine ${id}`,
    batchNumber: `B-${id.toUpperCase()}`,
    quantity: 10,
    unit: 'tablet',
    expiryDate,
    ...overrides,
  };
}
