import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import type { Role } from '@/shared/lib/roles';

import { DashboardPage } from './DashboardPage';

// Each view has its own tests; here only the choice between them is under test.
vi.mock('@/features/nurse', () => ({ NurseDashboard: () => <p>nurse view</p> }));
vi.mock('@/features/doctor', () => ({ DoctorDashboard: () => <p>doctor view</p> }));
vi.mock('./StaffDashboard', () => ({ StaffDashboard: () => <p>staff view</p> }));
vi.mock('./PatientHome', () => ({ PatientHome: () => <p>patient view</p> }));

function signInAs(role: Role) {
  useAuthStore.getState().setSession({
    user: {
      id: 'u1',
      name: 'Asha Rao',
      email: 'asha@example.com',
      role,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    accessToken: 'a',
    refreshToken: 'r',
  });
}

beforeEach(() => useAuthStore.getState().clear());

describe('DashboardPage', () => {
  it('gives a nurse the nurse dashboard', () => {
    signInAs('nurse');
    render(<DashboardPage />);
    expect(screen.getByText('nurse view')).toBeInTheDocument();
  });

  it('gives a doctor the doctor dashboard', () => {
    signInAs('doctor');
    render(<DashboardPage />);
    expect(screen.getByText('doctor view')).toBeInTheDocument();
    expect(screen.queryByText('staff view')).not.toBeInTheDocument();
  });

  it.each(['admin', 'manager', 'receptionist', 'pharmacist', 'accountant'] as Role[])(
    'keeps today’s board for a %s',
    (role) => {
      signInAs(role);
      render(<DashboardPage />);
      expect(screen.getByText('staff view')).toBeInTheDocument();
    }
  );

  it('gives a patient their own home, never the analytics board', () => {
    signInAs('patient');
    render(<DashboardPage />);
    expect(screen.getByText('patient view')).toBeInTheDocument();
    expect(screen.queryByText('staff view')).not.toBeInTheDocument();
  });
});
