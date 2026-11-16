import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { attentionLog, caseloadPatient, pageOf, routes, userOf } from '../test-fixtures';
import { HandoverPage } from './HandoverPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const ON_DUTY_A = '/nurses/ward/Ward%20A/on-duty';

const onDuty = (name: string, userId: string) => ({
  id: `n-${userId}`,
  user: { id: userId, name },
  assignedWards: ['Ward A'],
  grade: 'staff_nurse',
});

interface Setup {
  caseload?: unknown;
  colleagues?: unknown[];
  sent?: unknown;
}

function setup({
  caseload = pageOf([
    caseloadPatient('1', 'Ada Lovelace'),
    caseloadPatient('2', 'Bea Arthur', { bed: null, ward: undefined }),
  ]),
  // The signed-in nurse is on duty too — and must never be offered to herself.
  colleagues = [onDuty('Nia Okafor', 'u-nurse'), onDuty('Sam Reyes', 'u-sam')],
  sent = pageOf([]),
}: Setup = {}) {
  client.get.mockImplementation(routes({ [ON_DUTY_A]: colleagues }));
  client.page.mockImplementation(
    routes({ '/patients/caseload': caseload, '/care-logs/me': sent })
  );
}

const field = (name: RegExp) => screen.getByLabelText(name);

async function choosePatient(name: RegExp = /ada lovelace/i) {
  await userEvent.selectOptions(
    field(/^patient/i),
    await screen.findByRole('option', { name })
  );
}

async function chooseReceiver(name = 'Sam Reyes') {
  await userEvent.selectOptions(
    await screen.findByLabelText(/hand over to/i),
    await screen.findByRole('option', { name })
  );
}

// While sending, the button also carries its spinner's label.
const submit = () => screen.getByRole('button', { name: /(^|\s)hand over$/i });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useAuthStore
    .getState()
    .setSession({ user: userOf('nurse'), accessToken: 'a', refreshToken: 'r' });
});

describe('HandoverPage', () => {
  it('offers the nurse’s own patients to hand over', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    expect(screen.getByRole('heading', { name: /^handover$/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /ada lovelace/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /bea arthur/i })).toBeInTheDocument();
  });

  it('offers the other nurses on duty in the patient’s ward, never the sender', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();

    expect(await screen.findByRole('option', { name: 'Sam Reyes' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Nia Okafor' })).not.toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith(ON_DUTY_A);
  });

  it('cannot be sent until a patient, a receiver and a summary are chosen', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    expect(submit()).toBeDisabled();

    await choosePatient();
    await chooseReceiver();
    expect(submit()).toBeDisabled();

    await userEvent.type(field(/summary/i), 'Stable overnight');
    expect(submit()).toBeEnabled();
  });

  it('counts the summary against its limit', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    await userEvent.type(field(/summary/i), 'Stable');

    expect(screen.getByText('6 / 4000')).toBeInTheDocument();
  });

  it('sends the handover, tells the nurse who was told, and clears the form', async () => {
    setup();
    client.post.mockResolvedValue({});
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();
    await chooseReceiver();
    await userEvent.type(field(/summary/i), '  Stable overnight  ');

    await userEvent.click(submit());

    expect(client.post).toHaveBeenCalledWith('/care-logs/handovers', {
      patientId: '1',
      toNurseUserId: 'u-sam',
      summary: 'Stable overnight',
    });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === 'Handover sent to Sam Reyes')).toBe(
        true
      )
    );
    await waitFor(() => expect(field(/summary/i)).toHaveValue(''));
    expect(field(/^patient/i)).toHaveValue('');
  });

  it('sends outstanding tasks, dropping blank ones and any that were removed', async () => {
    setup();
    client.post.mockResolvedValue({});
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();
    await chooseReceiver();
    await userEvent.type(field(/summary/i), 'Stable');

    await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    await userEvent.type(screen.getByLabelText(/^task 1$/i), 'Check dressing at 6');
    await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    await userEvent.type(screen.getByLabelText(/^task 2$/i), 'Chase bloods');
    await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove task 2/i }));
    await userEvent.click(submit());

    expect(client.post).toHaveBeenCalledWith('/care-logs/handovers', {
      patientId: '1',
      toNurseUserId: 'u-sam',
      summary: 'Stable',
      outstandingTasks: ['Check dressing at 6'],
    });
  });

  it('stops adding tasks at the limit', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    for (let i = 0; i < 50; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    }

    expect(screen.getByRole('button', { name: /add task/i })).toBeDisabled();
  }, 20_000);

  it('says so, and cannot send, when nobody else is on duty in the ward', async () => {
    setup({ colleagues: [onDuty('Nia Okafor', 'u-nurse')] });
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();
    await userEvent.type(field(/summary/i), 'Stable');

    expect(
      await screen.findByText(
        'No other nurses on duty in Ward A. Ask the charge nurse to check the roster.'
      )
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('says so, and cannot send, when the patient has no ward yet', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient(/bea arthur/i);
    await userEvent.type(field(/summary/i), 'Stable');

    expect(await screen.findByText(/isn’t on a ward yet/i)).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('cannot be sent twice while the first is on its way', async () => {
    setup();
    client.post.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();
    await chooseReceiver();
    await userEvent.type(field(/summary/i), 'Stable');

    await userEvent.click(submit());

    await waitFor(() => expect(submit()).toBeDisabled());
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('keeps what was typed when the handover fails', async () => {
    setup();
    client.post.mockRejectedValue(new ApiError('SERVER_ERROR', 'boom', 500));
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });
    await choosePatient();
    await chooseReceiver();
    await userEvent.type(field(/summary/i), 'Stable overnight');

    await userEvent.click(submit());

    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.tone === 'danger')).toBe(true));
    expect(field(/summary/i)).toHaveValue('Stable overnight');
    expect(submit()).toBeEnabled();
  });

  it('lists the handovers this nurse has sent', async () => {
    setup({
      sent: pageOf([
        attentionLog('h1', 'Ada Lovelace', {
          type: 'handover',
          requiresAttention: false,
          notes: undefined,
          handover: {
            toNurse: { id: 'u-sam', name: 'Sam Reyes' },
            summary: 'Settled, watch the drain',
            outstandingTasks: ['Chase bloods', 'Check dressing'],
          },
        }),
      ]),
    });
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    const sent = await screen.findByRole('region', { name: /sent handovers/i });
    expect(await within(sent).findByText('Settled, watch the drain')).toBeInTheDocument();
    expect(within(sent).getByText(/to sam reyes/i)).toBeInTheDocument();
    expect(within(sent).getByText(/2 tasks/i)).toBeInTheDocument();
    expect(client.page).toHaveBeenCalledWith(
      '/care-logs/me',
      expect.objectContaining({ params: expect.objectContaining({ type: 'handover' }) })
    );
  });

  it('says when nothing has been handed over yet', async () => {
    setup();
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    expect(await screen.findByText('You haven’t handed anything over yet.')).toBeInTheDocument();
  });

  it('offers a retry when the sent list fails, without losing the form', async () => {
    setup({
      sent: () => {
        throw new ApiError('SERVER_ERROR', 'boom', 500);
      },
    });
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    const sent = await screen.findByRole('region', { name: /sent handovers/i });
    const alert = await within(sent).findByRole('alert');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(field(/summary/i)).toBeInTheDocument();
  });

  it('says when the nurse has no patients to hand over', async () => {
    setup({ caseload: pageOf([]) });
    renderWithProviders(<HandoverPage />, { route: '/app/handover' });

    expect(await screen.findByText(/no patients assigned to you/i)).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });
});
