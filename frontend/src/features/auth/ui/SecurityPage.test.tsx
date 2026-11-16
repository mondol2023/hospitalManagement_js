import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/envelope';
import type { User } from '@/shared/types/domain';
import { useToastStore } from '@/shared/ui';

import { authApi } from '../api/auth-api';
import { useAuthStore } from '../model/auth-store';
import { SecurityPage } from './SecurityPage';

vi.mock('../api/auth-api', () => ({
  authApi: {
    changePassword: vi.fn(),
    logoutEverywhere: vi.fn(),
    logout: vi.fn(),
  },
}));

const user: User = {
  id: 'u1',
  name: 'Asha Rao',
  email: 'asha@example.com',
  role: 'nurse',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SecurityPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fill(current: string, next: string, confirm: string) {
  const typing = userEvent.setup();
  await typing.type(screen.getByLabelText(/current password/i), current);
  await typing.type(screen.getByLabelText(/^new password/i), next);
  await typing.type(screen.getByLabelText(/confirm new password/i), confirm);
  await typing.click(screen.getByRole('button', { name: /change password/i }));
  return typing;
}

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.getState().clear();
    useAuthStore.getState().setSession({ user, accessToken: 'old-access', refreshToken: 'old-refresh' });
  });

  it('refuses a confirmation that does not match, without calling the API', async () => {
    renderPage();
    await fill('current-pass', 'new-password-1', 'new-password-2');

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(authApi.changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password that is the current one', async () => {
    renderPage();
    await fill('same-password', 'same-password', 'same-password');

    expect(await screen.findByText(/have not used here before/i)).toBeInTheDocument();
    expect(authApi.changePassword).not.toHaveBeenCalled();
  });

  it('sends only the two passwords, keeps this device signed in on the new tokens, and says so', async () => {
    vi.mocked(authApi.changePassword).mockResolvedValue({
      user,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    renderPage();
    await fill('current-pass', 'new-password-1', 'new-password-1');

    await waitFor(() =>
      expect(authApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'current-pass',
        newPassword: 'new-password-1',
      })
    );
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('new-access'));
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
    expect(useToastStore.getState().toasts[0]?.title).toBe('Password changed');
    // The fields are cleared so a password is not left sitting in the form.
    expect(screen.getByLabelText(/current password/i)).toHaveValue('');
  });

  it('puts a wrong current password on that field and stays signed in', async () => {
    vi.mocked(authApi.changePassword).mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'Current password is incorrect', 401)
    );
    renderPage();
    await fill('wrong-pass', 'new-password-1', 'new-password-1');

    expect(await screen.findByText(/isn.t your current password/i)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('old-access');
  });

  it('signs out everywhere only after a confirmation', async () => {
    vi.mocked(authApi.logoutEverywhere).mockResolvedValue({ revoked: true });
    renderPage();
    const typing = userEvent.setup();

    await typing.click(screen.getByRole('button', { name: /sign out everywhere/i }));
    expect(authApi.logoutEverywhere).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await typing.click(screen.getByRole('button', { name: /sign out of all devices/i }));

    await waitFor(() => expect(authApi.logoutEverywhere).toHaveBeenCalledTimes(1));
    expect(dialog).toBeDefined();
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });
});
