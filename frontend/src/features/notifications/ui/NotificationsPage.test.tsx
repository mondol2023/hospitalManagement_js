import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppNotification } from '@/shared/types/domain';

import { notificationsApi } from '../api/notifications-api';
import { NotificationBell } from './NotificationBell';
import { NotificationsPage } from './NotificationsPage';

vi.mock('../api/notifications-api', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

function note(id: string, over: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    user: 'u1',
    type: 'system',
    title: `Title ${id}`,
    isRead: false,
    createdAt: '2026-11-16T08:00:00.000Z',
    ...over,
  } as AppNotification;
}

function page(items: AppNotification[], over: { page?: number; totalPages?: number; total?: number } = {}) {
  return {
    items,
    pagination: {
      page: over.page ?? 1,
      limit: 20,
      total: over.total ?? items.length,
      totalPages: over.totalPages ?? 1,
    },
  };
}

function renderUi(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ count: 2 });
    vi.mocked(notificationsApi.markRead).mockResolvedValue(note('1', { isRead: true }));
    vi.mocked(notificationsApi.markAllRead).mockResolvedValue({ modified: 2 });
  });

  it('lists the inbox, newest page first', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(
      page([note('1', { type: 'emergency' }), note('2', { isRead: true })])
    );
    renderUi(<NotificationsPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(await screen.findByText('Title 1')).toBeInTheDocument();
    expect(screen.getByText('Title 2')).toBeInTheDocument();
    expect(notificationsApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('narrows to unread, and to one type, on the server', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(page([note('1')]));
    renderUi(<NotificationsPage />);
    const user = userEvent.setup();
    await screen.findByText('Title 1');

    await user.click(screen.getByRole('button', { name: /^unread/i }));
    await waitFor(() =>
      expect(notificationsApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, unreadOnly: true })
    );

    await user.selectOptions(screen.getByLabelText(/type/i), 'billing');
    await waitFor(() =>
      expect(notificationsApi.list).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        unreadOnly: true,
        type: 'billing',
      })
    );
  });

  it('goes back to page 1 when a filter changes', async () => {
    vi.mocked(notificationsApi.list).mockImplementation(async (params) =>
      page([note('1')], { page: params?.page ?? 1, totalPages: 3, total: 50 })
    );
    renderUi(<NotificationsPage />);
    const user = userEvent.setup();
    await screen.findByText('Title 1');

    await user.click(within(screen.getByRole('navigation', { name: /pagination/i })).getByRole('button', { name: /next/i }));
    await waitFor(() => expect(notificationsApi.list).toHaveBeenLastCalledWith({ page: 2, limit: 20 }));

    await user.click(screen.getByRole('button', { name: /^unread/i }));
    await waitFor(() =>
      expect(notificationsApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, unreadOnly: true })
    );
  });

  it('marks one read, and all read', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(page([note('1'), note('2')]));
    renderUi(<NotificationsPage />);
    const user = userEvent.setup();
    await screen.findByText('Title 1');

    await user.click(screen.getAllByRole('button', { name: /^mark read$/i })[0]!);
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith('1'));

    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalledTimes(1));
  });

  it('hides "mark all read" when nothing is unread', async () => {
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ count: 0 });
    vi.mocked(notificationsApi.list).mockResolvedValue(page([note('1', { isRead: true })]));
    renderUi(<NotificationsPage />);
    await screen.findByText('Title 1');

    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('invites an action when the inbox is empty', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(page([]));
    renderUi(<NotificationsPage />);

    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it('says what happened when the inbox cannot load', async () => {
    vi.mocked(notificationsApi.list).mockRejectedValue(new Error('boom'));
    renderUi(<NotificationsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load/i);
  });
});

describe('NotificationBell', () => {
  it('links to the full inbox from its panel', async () => {
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ count: 0 });
    vi.mocked(notificationsApi.list).mockResolvedValue(page([]));
    renderUi(<NotificationBell />);

    await userEvent.setup().click(screen.getByRole('button', { name: /notifications/i }));

    expect(await screen.findByRole('link', { name: /see all notifications/i })).toHaveAttribute(
      'href',
      '/app/notifications'
    );
  });
});
