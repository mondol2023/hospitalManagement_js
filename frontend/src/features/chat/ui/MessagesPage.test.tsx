import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import type { Conversation } from '@/shared/types/domain';
import type * as UiModule from '@/shared/ui';
import { toast } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { MessagesPage } from './MessagesPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof UiModule>()),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const client = vi.mocked(api, true);

function conversation(id: string, title: string): Conversation {
  return {
    id,
    type: 'staff_only',
    title,
    participants: [],
    createdAt: '2026-11-20T09:00:00.000Z',
  };
}

const ROUND = conversation('c-round', 'Ward round');
const HANDOVER = conversation('c-handover', 'Night handover');

/** What the inbox holds. Anything else is only reachable by id. */
function setup({
  inbox = [ROUND, HANDOVER],
  byId = {},
}: { inbox?: Conversation[]; byId?: Record<string, Conversation | 'missing'> } = {}) {
  client.page.mockResolvedValue({
    items: inbox,
    meta: { page: 1, limit: 50, total: inbox.length, totalPages: 1 },
  } as never);

  client.get.mockImplementation((async (url: string) => {
    const detail = /^\/chat\/([^/]+)$/.exec(url);
    if (detail) {
      const found = byId[detail[1] as string] ?? inbox.find((item) => item.id === detail[1]);
      if (!found || found === 'missing') throw new ApiError('NOT_FOUND', 'none', 404);
      return found;
    }
    if (url.endsWith('/messages')) return [];
    if (url === '/chat/unread') return { total: 0, conversations: 0, byConversation: [] };
    throw new Error(`unmocked GET ${url}`);
  }) as never);

  client.post.mockResolvedValue({} as never);
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage(route = '/app/messages') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/app/messages" element={<MessagesPage />} />
      </Routes>
      <Where />
    </>,
    { route }
  );
}

const thread = () => screen.findByRole('heading', { level: 2 });
const row = (title: string) => screen.findByRole('button', { name: new RegExp(title, 'i') });

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe('MessagesPage ?c= deep link', () => {
  it('opens the conversation named in the URL', async () => {
    renderPage('/app/messages?c=c-handover');

    expect(await thread()).toHaveTextContent('Night handover');
    expect(await row('Night handover')).toHaveAttribute('aria-current', 'true');
    expect(await row('Ward round')).not.toHaveAttribute('aria-current');
  });

  it('opens a thread that is not on the inbox page by fetching it', async () => {
    setup({ byId: { 'c-new': conversation('c-new', 'Just created') } });
    renderPage('/app/messages?c=c-new');

    expect(await thread()).toHaveTextContent('Just created');
  });

  it('shows no thread when the URL names none', async () => {
    renderPage();

    expect(await screen.findByText(/no conversation selected/i)).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/messages$/);
  });

  it('writes ?c= when a thread is picked, so a refresh keeps it', async () => {
    renderPage();

    await userEvent.click(await row('Ward round'));

    expect(screen.getByTestId('where')).toHaveTextContent('/app/messages?c=c-round');
    expect(await thread()).toHaveTextContent('Ward round');
  });

  it('drops ?c= when the reader goes back to all conversations', async () => {
    renderPage('/app/messages?c=c-round');
    await thread();

    await userEvent.click(screen.getByRole('button', { name: /all conversations/i }));

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/messages$/);
    expect(await screen.findByText(/no conversation selected/i)).toBeInTheDocument();
  });

  describe('an id the reader cannot open', () => {
    it('falls back to the inbox with a toast, and clears the param', async () => {
      setup({ byId: { 'c-gone': 'missing' } });
      renderPage('/app/messages?c=c-gone');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("That conversation isn't available.")
      );
      expect(await screen.findByText(/no conversation selected/i)).toBeInTheDocument();
      expect(await row('Ward round')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/messages$/)
      );
    });

    it('toasts once, not on every re-render', async () => {
      setup({ byId: { 'c-gone': 'missing' } });
      renderPage('/app/messages?c=c-gone');

      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      await userEvent.click(await row('Ward round'));
      await thread();

      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });
});
