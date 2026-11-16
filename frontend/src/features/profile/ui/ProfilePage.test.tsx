import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import type { Role } from '@/shared/lib/roles';
import type { User } from '@/shared/types/domain';
import { useToastStore } from '@/shared/ui';

import { profileApi } from '../api/profile-api';
import { ProfilePage } from './ProfilePage';

vi.mock('../api/profile-api', () => ({
  profileApi: {
    doctor: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    nurse: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    staff: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    patient: { get: vi.fn(), update: vi.fn(), uploadAvatar: vi.fn() },
  },
}));

const api = vi.mocked(profileApi, true);

function userWith(role: Role, extra: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Asha Rao',
    email: 'asha@example.com',
    role,
    phone: '+15550001111',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function signIn(role: Role, extra?: Partial<User>) {
  useAuthStore
    .getState()
    .setSession({ user: userWith(role, extra), accessToken: 'a', refreshToken: 'r' });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const doctor = {
  id: 'd1',
  employeeId: 'DOC-1',
  specialization: 'Cardiology',
  qualifications: 'MBBS',
  licenseNumber: '',
  experienceInYears: 10,
  consultationFeeCents: 12_000,
  availableDays: ['monday'],
  timeSlots: [{ start: '09:00', end: '12:00' }],
  slotDurationMinutes: 30,
  isAcceptingPatients: true,
  isOnDuty: false,
  department: 'Heart',
  shift: 'morning',
};

const nurse = {
  id: 'n1',
  employeeId: 'NUR-1',
  qualifications: 'BSN',
  experienceInYears: 3,
  department: 'Ward B',
  shift: 'night',
  isOnDuty: true,
  assignedWards: ['B'],
  grade: 'senior_nurse',
  maxPatients: 8,
};

const staff = {
  id: 's1',
  employeeId: 'ADM-1',
  designation: 'Office manager',
  employmentType: 'full_time',
  department: 'Admin',
  shift: 'morning',
  isOnDuty: false,
};

const patient = {
  id: 'p1',
  medicalRecordNumber: 'MRN-42',
  bloodGroup: 'O+',
  allergies: ['Penicillin'],
  address: '12 Elm St',
  dateOfBirth: '1990-04-02T00:00:00.000Z',
  emergencyContact: { name: 'Sam', relationship: 'Sibling', phone: '+15551234567' },
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.getState().clear();
  });

  it('shows who you are, and says the account details are not editable here', async () => {
    signIn('nurse');
    api.nurse.get.mockResolvedValue(nurse as never);
    renderPage();

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    expect(screen.getByText(/ask an administrator/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
    await screen.findByLabelText(/qualifications/i);
  });

  it('offers a retry when the profile cannot be loaded', async () => {
    signIn('nurse');
    api.nurse.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(nurse as never);
    renderPage();

    const retry = await screen.findByRole('button', { name: /try again/i });
    await userEvent.setup().click(retry);

    expect(await screen.findByLabelText(/qualifications/i)).toHaveValue('BSN');
  });

  describe('doctor', () => {
    beforeEach(() => {
      signIn('doctor');
      api.doctor.get.mockResolvedValue(doctor as never);
    });

    it('saves only changed-and-valid data, with the fee as whole cents', async () => {
      api.doctor.update.mockResolvedValue({ ...doctor, consultationFeeCents: 15_050 } as never);
      renderPage();
      const typing = userEvent.setup();

      const fee = await screen.findByLabelText(/consultation fee/i);
      expect(fee).toHaveValue('120.00');
      expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();

      await typing.clear(fee);
      await typing.type(fee, '150.50');
      await typing.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => expect(api.doctor.update).toHaveBeenCalledTimes(1));
      expect(api.doctor.update.mock.calls[0]?.[0]).toMatchObject({
        consultationFeeCents: 15_050,
        specialization: 'Cardiology',
        availableDays: ['monday'],
      });
      expect(api.doctor.update.mock.calls[0]?.[0]).not.toHaveProperty('employeeId');
      expect(
        useToastStore.getState().toasts.some((toast) => toast.title === 'Profile saved')
      ).toBe(true);
      // Re-seeded from the saved document, so the form is clean again.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled()
      );
    });

    it('does not call the API for an invalid fee', async () => {
      renderPage();
      const typing = userEvent.setup();
      const fee = await screen.findByLabelText(/consultation fee/i);

      await typing.clear(fee);
      await typing.type(fee, 'lots');
      await typing.click(screen.getByRole('button', { name: /save profile/i }));

      expect(await screen.findByText(/enter a fee like/i)).toBeInTheDocument();
      expect(api.doctor.update).not.toHaveBeenCalled();
    });

    it('adds and removes time slots', async () => {
      renderPage();
      const typing = userEvent.setup();
      await screen.findByLabelText(/slot 1 start/i);

      await typing.click(screen.getByRole('button', { name: /add time slot/i }));
      expect(screen.getByLabelText(/slot 2 start/i)).toBeInTheDocument();

      await typing.click(screen.getByRole('button', { name: /remove slot 1/i }));
      expect(screen.queryByLabelText(/slot 2 start/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/slot 1 start/i)).toBeInTheDocument();
    });

    it('goes on duty with one click and says so', async () => {
      api.doctor.setDuty.mockResolvedValue({ ...doctor, isOnDuty: true } as never);
      renderPage();

      await userEvent.setup().click(await screen.findByRole('button', { name: /go on duty/i }));

      await waitFor(() => expect(api.doctor.setDuty).toHaveBeenCalledWith(true));
      expect(
        useToastStore.getState().toasts.some((toast) => toast.title === 'You’re on duty')
      ).toBe(true);
      expect(await screen.findByRole('button', { name: /go off duty/i })).toBeInTheDocument();
    });
  });

  describe('nurse', () => {
    it('lets a nurse edit their own details but shows wards and grade as read-only', async () => {
      signIn('nurse');
      api.nurse.get.mockResolvedValue(nurse as never);
      api.nurse.update.mockResolvedValue({ ...nurse, department: 'Ward C' } as never);
      renderPage();
      const typing = userEvent.setup();

      const department = await screen.findByLabelText(/department/i);
      await typing.clear(department);
      await typing.type(department, 'Ward C');
      await typing.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => expect(api.nurse.update).toHaveBeenCalledTimes(1));
      expect(Object.keys(api.nurse.update.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
        'department',
        'experienceInYears',
        'licenseNumber',
        'qualifications',
        'shift',
      ]);
      expect(screen.getByText('Senior nurse')).toBeInTheDocument();
      expect(screen.queryByLabelText(/assigned wards/i)).not.toBeInTheDocument();
    });

    it('shows a duty button for a nurse who is on duty as "Go off duty"', async () => {
      signIn('nurse');
      api.nurse.get.mockResolvedValue(nurse as never);
      renderPage();
      expect(await screen.findByRole('button', { name: /go off duty/i })).toBeInTheDocument();
    });
  });

  describe('admin and other staff', () => {
    it.each<Role>(['admin', 'manager', 'receptionist', 'pharmacist', 'accountant'])(
      'loads %s through /staff/me',
      async (role) => {
        signIn(role);
        api.staff.get.mockResolvedValue(staff as never);
        renderPage();

        expect(await screen.findByLabelText(/^department/i)).toHaveValue('Admin');
        expect(screen.getByText('Office manager')).toBeInTheDocument();
        expect(api.doctor.get).not.toHaveBeenCalled();
        expect(api.nurse.get).not.toHaveBeenCalled();
      }
    );
  });

  describe('patient', () => {
    beforeEach(() => {
      signIn('patient');
      api.patient.get.mockResolvedValue(patient as never);
    });

    it('has no duty toggle, and keeps clinical fields read-only', async () => {
      renderPage();
      await screen.findByLabelText(/contact name/i);

      expect(screen.queryByRole('button', { name: /duty/i })).not.toBeInTheDocument();
      expect(screen.getByText('MRN-42')).toBeInTheDocument();
      expect(screen.getByText('Penicillin')).toBeInTheDocument();
      expect(screen.queryByLabelText(/allergies/i)).not.toBeInTheDocument();
    });

    it('saves the emergency contact without clinical fields', async () => {
      api.patient.update.mockResolvedValue(patient as never);
      renderPage();
      const typing = userEvent.setup();

      const phone = await screen.findByLabelText(/contact phone/i);
      await typing.clear(phone);
      await typing.type(phone, '+15559998888');
      await typing.click(screen.getByRole('button', { name: /save profile/i }));

      await waitFor(() => expect(api.patient.update).toHaveBeenCalledTimes(1));
      const sent = api.patient.update.mock.calls[0]?.[0];
      expect(sent?.emergencyContact.phone).toBe('+15559998888');
      expect(Object.keys(sent ?? {}).sort()).toEqual(['address', 'dateOfBirth', 'emergencyContact']);
    });

    it('turns away a photo that is too large without uploading it', async () => {
      renderPage();
      await screen.findByLabelText(/contact name/i);

      const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
      await userEvent
        .setup({ applyAccept: false })
        .upload(screen.getByLabelText(/profile photo file/i), big);

      expect(await screen.findByText(/over 5 MB/i)).toBeInTheDocument();
      expect(api.patient.uploadAvatar).not.toHaveBeenCalled();
    });

    it('uploads a photo and puts it in the session so the topbar can show it', async () => {
      api.patient.uploadAvatar.mockResolvedValue({ profilePic: '/uploads/asha.png' });
      renderPage();
      await screen.findByLabelText(/contact name/i);

      const png = new File([new Uint8Array(2048)], 'asha.png', { type: 'image/png' });
      await userEvent.setup().upload(screen.getByLabelText(/profile photo file/i), png);

      await waitFor(() => expect(api.patient.uploadAvatar).toHaveBeenCalledWith(png));
      await waitFor(() =>
        expect(useAuthStore.getState().user?.profilePic).toBe('/uploads/asha.png')
      );
      expect(useToastStore.getState().toasts.some((toast) => toast.title === 'Photo saved')).toBe(
        true
      );
    });
  });

  it('shows no avatar uploader to staff — the backend has no endpoint for it', async () => {
    signIn('doctor');
    api.doctor.get.mockResolvedValue(doctor as never);
    renderPage();
    await screen.findByLabelText(/specialization/i);
    expect(screen.queryByLabelText(/profile photo file/i)).not.toBeInTheDocument();
  });
});
