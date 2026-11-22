import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import {
  MedicalRecordList,
  PatientDetailPage,
  VitalsPanel,
  type ConsultationFormComponent,
  type RecordDrawerComponent,
} from './PatientDetailPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn() },
}));

const client = vi.mocked(api, true);

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  diagnosis: 'Community-acquired pneumonia',
  treatmentPlan: 'Amoxicillin 500 mg three times daily for five days',
  visitDate: '2026-11-10T09:00:00.000Z',
  followUpDate: '2026-11-24T09:00:00.000Z',
  doctor: { id: 'd1', name: 'Dr. Grace Hopper' },
  ...overrides,
});

const page = (items: unknown[]) => ({
  items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MedicalRecordList', () => {
  it('shows the diagnosis, the doctor, the follow-up and the treatment plan', async () => {
    client.page.mockResolvedValue(page([record()]));
    renderWithProviders(<MedicalRecordList patientId="p1" />);

    expect(await screen.findByText('Community-acquired pneumonia')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByText(/follow-up/i)).toBeInTheDocument();
    expect(
      screen.getByText('Amoxicillin 500 mg three times daily for five days')
    ).toBeInTheDocument();
  });

  it('omits the follow-up and the plan when the record has neither', async () => {
    client.page.mockResolvedValue(
      page([record({ followUpDate: undefined, treatmentPlan: undefined })])
    );
    renderWithProviders(<MedicalRecordList patientId="p1" />);

    expect(await screen.findByText('Community-acquired pneumonia')).toBeInTheDocument();
    expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/amoxicillin/i)).not.toBeInTheDocument();
  });

  // The chart does not know what a record looks like in full — whoever mounts it
  // hands over the way to open one — so with nothing handed over the rows stay
  // plain text rather than buttons that do nothing.
  it('has no buttons on its rows unless it was given a way to open a record', async () => {
    client.page.mockResolvedValue(page([record()]));
    renderWithProviders(<MedicalRecordList patientId="p1" />);

    await screen.findByText('Community-acquired pneumonia');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a record when its row is chosen', async () => {
    const onOpen = vi.fn();
    client.page.mockResolvedValue(page([record()]));
    renderWithProviders(<MedicalRecordList patientId="p1" onOpen={onOpen} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /community-acquired pneumonia/i })
    );

    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('says so when there are no consultations', async () => {
    client.page.mockResolvedValue(page([]));
    renderWithProviders(<MedicalRecordList patientId="p1" />);

    expect(await screen.findByText('No consultations recorded')).toBeInTheDocument();
  });

  it('reports a failed load with the server message', async () => {
    const error = new ApiError('FORBIDDEN', 'Forbidden', 403);
    client.page.mockRejectedValue(error);
    renderWithProviders(<MedicalRecordList patientId="p1" />);

    expect(await screen.findByText('Could not load consultations')).toBeInTheDocument();
    expect(screen.getByText(error.userMessage)).toBeInTheDocument();
  });
});

describe('PatientDetailPage consultation entry point', () => {
  const patient = {
    id: 'p1',
    user: { id: 'u1', name: 'Ada Lovelace' },
    medicalRecordNumber: 'MRN-1',
    age: 36,
    gender: 'female',
    allergies: [],
    chronicConditions: [],
    emergencyContact: { name: 'Charles', relationship: 'Spouse', phone: '555-0100' },
    assignedNurses: [],
    isAdmitted: false,
  };

  const signIn = (role: string) =>
    useAuthStore.getState().setSession({
      user: {
        id: 'u-me',
        name: 'Dr Imani Khan',
        email: 'imani@example.com',
        role,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as never,
      accessToken: 'a',
      refreshToken: 'r',
    });

  // Stands in for the doctor slice's form, which the app shell injects.
  const FakeForm: ConsultationFormComponent = ({ open, patient: who, onOpenRecord }) =>
    open ? (
      <div role="dialog" aria-label="Fake consultation form">
        <p>Form for {who.name} ({who.id})</p>
        <button onClick={() => onOpenRecord?.('r9')}>Fake attachments</button>
      </div>
    ) : null;

  const FakeDrawer: RecordDrawerComponent = ({ recordId }) =>
    recordId ? <p>Drawer open on {recordId}</p> : null;

  function renderChart(props: React.ComponentProps<typeof PatientDetailPage> = {}) {
    renderWithProviders(
      <Routes>
        <Route path="/patients/:patientId" element={<PatientDetailPage {...props} />} />
      </Routes>,
      { route: '/patients/p1' }
    );
  }

  beforeEach(() => {
    client.get.mockImplementation(async (url: string) => (url === '/patients/p1' ? patient : null));
    client.page.mockResolvedValue(page([]));
  });

  it('lets a doctor open the consultation form for this patient', async () => {
    signIn('doctor');
    renderChart({ ConsultationForm: FakeForm });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Add consultation' }));

    expect(screen.getByRole('dialog', { name: 'Fake consultation form' })).toHaveTextContent(
      'Form for Ada Lovelace (p1)'
    );
  });

  it('does not offer it to a nurse, who cannot write consultations', async () => {
    signIn('nurse');
    renderChart({ ConsultationForm: FakeForm });

    await screen.findByRole('heading', { name: 'Ada Lovelace' });
    expect(screen.queryByRole('button', { name: 'Add consultation' })).not.toBeInTheDocument();
  });

  it('does not offer it when the app shell supplied no form', async () => {
    signIn('doctor');
    renderChart();

    await screen.findByRole('heading', { name: 'Ada Lovelace' });
    expect(screen.queryByRole('button', { name: 'Add consultation' })).not.toBeInTheDocument();
  });

  it('opens the saved record in the drawer when the form asks for it', async () => {
    signIn('doctor');
    renderChart({ ConsultationForm: FakeForm, RecordDrawer: FakeDrawer });

    await userEvent.click(await screen.findByRole('button', { name: 'Add consultation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fake attachments' }));

    expect(screen.getByText('Drawer open on r9')).toBeInTheDocument();
  });
});

describe('VitalsPanel', () => {
  it('reads the backend field names for heart rate and blood pressure', async () => {
    client.get.mockResolvedValue({
      recordedAt: '2026-11-21T08:00:00.000Z',
      vitals: { heartRateBpm: 72, systolicBp: 118, diastolicBp: 76, oxygenSaturation: 97 },
    });
    renderWithProviders(<VitalsPanel patientId="p1" />);

    expect(await screen.findByText('72')).toBeInTheDocument();
    expect(screen.getByText('118/76')).toBeInTheDocument();
  });

  it('says so when nothing has been recorded', async () => {
    client.get.mockResolvedValue(null);
    renderWithProviders(<VitalsPanel patientId="p1" />);

    expect(await screen.findByText('No vitals recorded')).toBeInTheDocument();
  });
});
