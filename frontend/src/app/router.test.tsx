import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { profileApi } from '@/features/profile/api/profile-api';
import { notificationsApi } from '@/features/notifications';
import type * as ClientModule from '@/shared/api/client';
import type { Role } from '@/shared/lib/roles';

// The self-service pages are the only private routes exercised here; their
// network edges are stubbed so the test is about routing, not fetching.
vi.mock('@/features/notifications/api/notifications-api', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));
vi.mock('@/features/profile/api/profile-api', () => ({
  profileApi: {
    doctor: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    nurse: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    staff: { get: vi.fn(), update: vi.fn(), setDuty: vi.fn() },
    patient: { get: vi.fn(), update: vi.fn(), uploadAvatar: vi.fn() },
  },
}));

// The nurse pages go through the shared client; nothing answers, so they sit in
// their loading state — this file is about who can reach them, not what they show.
vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: {
    get: vi.fn(() => new Promise(() => {})),
    page: vi.fn(() => new Promise(() => {})),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { AppRouter } from './router';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRouter />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('route split', () => {
  beforeEach(() => {
    // What AppProviders does at startup: nothing is persisted, so the question
    // "is anyone signed in?" is already answered (AUDIT.md B1).
    useAuthStore.getState().clear();
  });

  it('shows the public front door at / without a session', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /find your way to care/i })).toBeInTheDocument();
  });

  it('sends an anonymous visitor from /app to the sign-in form', async () => {
    renderAt('/app');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('answers an unknown public URL with the public not-found page', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { name: /we can.t find that page/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it.each([
    ['/services', /^services$/i],
    ['/visit', /plan your visit/i],
    ['/emergency', /emergency/i],
    ['/patient-guide', /patient guide/i],
    ['/about', /about meridian health/i],
    ['/contact', /^contact$/i],
    ['/privacy', /^privacy$/i],
    ['/terms', /terms of use/i],
    ['/forgot-password', /password/i],
    ['/reset-password', /password/i],
  ])('renders the public page at %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('keeps the emergency strip on every public page', async () => {
    renderAt('/services');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText(/emergency/i).length).toBeGreaterThan(0);
  });

  it('says so when a service does not exist', async () => {
    renderAt('/services/no-such-service');
    expect(await screen.findByRole('heading', { name: /we can.t find that service/i })).toBeInTheDocument();
  });

  it('does not leave guards waiting once bootstrap has finished', () => {
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
  });

  describe('self-service pages (signed in)', () => {
    function signIn(role: Role) {
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

    beforeEach(() => {
      vi.mocked(notificationsApi.list).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });
      vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ count: 0 });
      vi.mocked(profileApi.staff.get).mockResolvedValue({
        id: 's1',
        employeeId: 'ADM-1',
        designation: 'Office manager',
        department: 'Admin',
        shift: 'morning',
        isOnDuty: false,
      } as never);
    });

    it.each<[Role]>([['admin'], ['doctor'], ['nurse'], ['receptionist'], ['patient']])(
      'opens the security page for %s',
      async (role) => {
        signIn(role);
        renderAt('/app/security');
        expect(await screen.findByRole('heading', { level: 1, name: /^security$/i })).toBeInTheDocument();
      }
    );

    it('opens the notifications inbox', async () => {
      signIn('nurse');
      renderAt('/app/notifications');
      expect(
        await screen.findByRole('heading', { level: 1, name: /^notifications$/i })
      ).toBeInTheDocument();
    });

    it('opens the profile page', async () => {
      signIn('admin');
      renderAt('/app/profile');
      expect(await screen.findByRole('heading', { level: 1, name: /my profile/i })).toBeInTheDocument();
      expect(await screen.findByText('Office manager')).toBeInTheDocument();
    });

    describe('nurse pages', () => {
      it.each<[string, RegExp]>([
        ['/app/ward', /^ward$/i],
        ['/app/handover', /^handover$/i],
        ['/app/workload', /^workload$/i],
      ])('opens %s for a nurse', async (path, heading) => {
        signIn('nurse');
        renderAt(path);
        expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      });

      it.each<[string, Role]>([
        ['/app/ward', 'doctor'],
        ['/app/ward', 'patient'],
        ['/app/handover', 'admin'],
        ['/app/handover', 'receptionist'],
        ['/app/workload', 'doctor'],
        ['/app/workload', 'patient'],
      ])('keeps %s closed to a %s', async (path, role) => {
        signIn(role);
        renderAt(path);
        expect(await screen.findByText(/do not have access to this area/i)).toBeInTheDocument();
      });
    });

    it('sends a signed-out visitor from /app/profile to sign-in', async () => {
      renderAt('/app/profile');
      expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
