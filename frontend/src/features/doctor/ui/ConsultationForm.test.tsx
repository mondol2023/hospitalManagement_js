import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { ConsultationForm } from './ConsultationForm';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const PATIENT = { id: 'p1', name: 'Ada Lovelace' };

function open(props: Partial<React.ComponentProps<typeof ConsultationForm>> = {}) {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <ConsultationForm open onOpenChange={onOpenChange} patient={PATIENT} {...props} />
  );
  return { onOpenChange, user: userEvent.setup() };
}

const save = () => screen.getByRole('button', { name: /save consultation/i });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  client.post.mockResolvedValue({ id: 'r1' });
});

describe('ConsultationForm', () => {
  it('names the patient it is for', () => {
    open();

    expect(screen.getByRole('dialog', { name: /new consultation/i })).toHaveTextContent(
      'Ada Lovelace'
    );
  });

  it('renders nothing while closed', () => {
    renderWithProviders(<ConsultationForm open={false} onOpenChange={vi.fn()} patient={PATIENT} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('will not save without a diagnosis, and says why', async () => {
    const { user } = open();

    await user.click(save());

    expect(await screen.findByText('Enter a diagnosis')).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('saves a diagnosis on its own as the smallest valid record, then closes', async () => {
    const { user, onOpenChange } = open();

    await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
    await user.click(save());

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/medical-records', {
        patientId: 'p1',
        diagnosis: 'Hypertension',
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('links the record to the visit when it is opened from one', async () => {
    const { user } = open({ appointmentId: 'a7' });

    await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
    await user.click(save());

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith(
        '/medical-records',
        expect.objectContaining({ patientId: 'p1', appointmentId: 'a7' })
      )
    );
  });

  it('sends the complaint, plan, notes, vitals and follow-up that were entered', async () => {
    const { user } = open();

    await user.type(screen.getByLabelText(/chief complaint/i), 'Headaches');
    await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
    await user.type(screen.getByLabelText(/treatment plan/i), 'Start amlodipine');
    await user.type(screen.getByLabelText(/systolic/i), '152');
    await user.type(screen.getByLabelText(/diastolic/i), '96');
    await user.type(screen.getByLabelText(/^notes/i), 'Less salt');
    await user.type(screen.getByLabelText(/follow-up date/i), '2099-01-05');
    await user.click(save());

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/medical-records', {
        patientId: 'p1',
        chiefComplaint: 'Headaches',
        diagnosis: 'Hypertension',
        treatmentPlan: 'Start amlodipine',
        notes: 'Less salt',
        vitals: { systolicBp: 152, diastolicBp: 96 },
        followUpDate: '2099-01-05T00:00:00.000Z',
      })
    );
  });

  it('refuses an out-of-range vital next to its field, without sending anything', async () => {
    const { user } = open();

    await user.type(screen.getByLabelText(/diagnosis/i), 'Fever');
    await user.type(screen.getByLabelText(/temperature/i), '60');
    await user.click(save());

    expect(await screen.findByText('25–45 °C')).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  describe('prescriptions', () => {
    it('starts with none, and adds a line on request', async () => {
      const { user } = open();

      expect(screen.queryByLabelText(/medicine 1/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /add prescription/i }));

      expect(screen.getByLabelText(/medicine 1/i)).toBeInTheDocument();
    });

    it('sends a filled line and drops a blank one', async () => {
      const { user } = open();

      await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
      await user.click(screen.getByRole('button', { name: /add prescription/i }));
      await user.click(screen.getByRole('button', { name: /add prescription/i }));
      await user.type(screen.getByLabelText(/medicine 1/i), 'Amlodipine');
      await user.type(screen.getByLabelText(/dosage 1/i), '5 mg');
      await user.type(screen.getByLabelText(/days 1/i), '14');
      await user.click(save());

      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith('/medical-records', {
          patientId: 'p1',
          diagnosis: 'Hypertension',
          prescriptions: [{ name: 'Amlodipine', dosage: '5 mg', durationDays: 14 }],
        })
      );
    });

    it('asks for the dosage when a line has a medicine but none', async () => {
      const { user } = open();

      await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
      await user.click(screen.getByRole('button', { name: /add prescription/i }));
      await user.type(screen.getByLabelText(/medicine 1/i), 'Amlodipine');
      await user.click(save());

      expect(await screen.findByText('Enter the dosage')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('removes a line', async () => {
      const { user } = open();

      await user.click(screen.getByRole('button', { name: /add prescription/i }));
      await user.click(screen.getByRole('button', { name: /remove prescription 1/i }));

      expect(screen.queryByLabelText(/medicine 1/i)).not.toBeInTheDocument();
    });

    it('stops offering new lines at the backend’s limit of 50', () => {
      open();
      const add = screen.getByRole('button', { name: /add prescription/i });

      // fireEvent, not userEvent: fifty full pointer sequences take nearly the whole test timeout.
      for (let count = 0; count < 49; count += 1) fireEvent.click(add);
      expect(add).toBeEnabled();

      fireEvent.click(add);
      expect(add).toBeDisabled();
    });
  });

  describe('when saving does not work out', () => {
    it('keeps the form open with everything the doctor typed', async () => {
      client.post.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
      const { user, onOpenChange } = open();

      await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
      await user.type(screen.getByLabelText(/chief complaint/i), 'Headaches');
      await user.click(save());

      await waitFor(() => expect(client.post).toHaveBeenCalled());
      await waitFor(() => expect(save()).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/diagnosis/i)).toHaveValue('Hypertension');
      expect(screen.getByLabelText(/chief complaint/i)).toHaveValue('Headaches');
    });

    it('says the visit already has a record, and stays open, on a 409 for the appointment', async () => {
      client.post.mockRejectedValue(
        new ApiError('APPOINTMENT_ALREADY_RECORDED', 'already recorded', 409)
      );
      const { user, onOpenChange } = open({ appointmentId: 'a7' });

      await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
      await user.click(save());

      const dialog = screen.getByRole('dialog');
      expect(await within(dialog).findByText('This visit already has a record')).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/diagnosis/i)).toHaveValue('Hypertension');
    });
  });

  it('offers “Add attachments” once saved, when it knows how to open the record', async () => {
    const onOpenRecord = vi.fn();
    const { user } = open({ onOpenRecord });

    await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
    await user.click(save());

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.action?.label).toBe('Add attachments')
    );
    useToastStore.getState().toasts[0]?.action?.onClick();
    expect(onOpenRecord).toHaveBeenCalledWith('r1');
  });

  // The same mounted form serves every patient and every visit, so a draft left
  // behind by closing it must not turn up on the next chart.
  it('starts empty each time it is opened, and forgets a previous conflict', async () => {
    client.post.mockRejectedValue(
      new ApiError('APPOINTMENT_ALREADY_RECORDED', 'already recorded', 409)
    );

    function Harness() {
      const [isOpen, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)}>Reopen</button>
          <ConsultationForm open={isOpen} onOpenChange={setOpen} patient={PATIENT} appointmentId="a7" />
        </>
      );
    }
    renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/diagnosis/i), 'Hypertension');
    await user.click(save());
    await screen.findByText('This visit already has a record');

    await user.click(screen.getByRole('button', { name: /close dialog/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(await screen.findByLabelText(/diagnosis/i)).toHaveValue('');
    expect(screen.queryByText('This visit already has a record')).not.toBeInTheDocument();
  });
});
