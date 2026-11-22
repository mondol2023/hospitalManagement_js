import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { AppointmentActions } from './AppointmentActions';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().setSession({
    user: {
      id: 'u-doc',
      name: 'Dr Imani Khan',
      email: 'imani@example.com',
      role: 'doctor',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    accessToken: 'a',
    refreshToken: 'r',
  });
});

describe('AppointmentActions', () => {
  // The doctor's day rows carry no doctor and no timestamps, so the component
  // must be satisfied by the two fields it actually reads.
  it('needs only an id and a status', async () => {
    client.post.mockResolvedValue({});
    renderWithProviders(<AppointmentActions appointment={{ id: 'a1', status: 'confirmed' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/appointments/a1/complete', {})
    );
  });

  it('tells the page which visit was completed, once the server has agreed', async () => {
    client.post.mockResolvedValue({});
    const onCompleted = vi.fn();
    renderWithProviders(
      <AppointmentActions
        appointment={{ id: 'a1', status: 'confirmed' }}
        onCompleted={onCompleted}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith('a1'));
  });

  it('stays quiet when completing fails, so no prompt appears for a visit that is still open', async () => {
    client.post.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const onCompleted = vi.fn();
    renderWithProviders(
      <AppointmentActions
        appointment={{ id: 'a1', status: 'confirmed' }}
        onCompleted={onCompleted}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('does not call onCompleted for other actions', async () => {
    client.post.mockResolvedValue({});
    const onCompleted = vi.fn();
    renderWithProviders(
      <AppointmentActions
        appointment={{ id: 'a1', status: 'confirmed' }}
        onCompleted={onCompleted}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'No-show' }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
