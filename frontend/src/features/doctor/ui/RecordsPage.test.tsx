import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { renderWithProviders } from '@/test/render';

import { pageOf, record, routes, userOf } from '../test-fixtures';
import { RecordsPage } from './RecordsPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

type Config = { params?: Record<string, unknown> };

function pageRequests() {
  return client.page.mock.calls
    .filter(([path]) => path === '/medical-records/me')
    .map(([, config]) => (config as Config | undefined)?.params);
}

function serve(items = [record('r1', 'Ada Lovelace'), record('r2', 'Grace Hopper')], extra = {}) {
  client.page.mockImplementation(
    routes({ '/medical-records/me': pageOf(items, extra) })
  );
  client.get.mockImplementation(
    routes({ '/medical-records/r1': record('r1', 'Ada Lovelace') })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore
    .getState()
    .setSession({ user: userOf('doctor'), accessToken: 'a', refreshToken: 'r' });
  serve();
});

describe('RecordsPage', () => {
  it('lists the doctor’s own records with visit date, patient, diagnosis and follow-up', async () => {
    renderWithProviders(<RecordsPage />);

    const row = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    expect(within(row).getByText('MRN-p-r1')).toBeInTheDocument();
    expect(within(row).getByText('Hypertension')).toBeInTheDocument();
    expect(within(row).getByText(formatDate('2026-11-18T10:00:00.000Z'))).toBeInTheDocument();
    expect(within(row).getByText(formatDate('2026-12-02T00:00:00.000Z'))).toBeInTheDocument();
    expect(pageRequests()[0]).toEqual({ page: 1, limit: 20 });
  });

  it('says “None” where no follow-up was set', async () => {
    serve([record('r1', 'Ada Lovelace', { followUpDate: null })]);
    renderWithProviders(<RecordsPage />);

    const row = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    expect(within(row).getByText('None')).toBeInTheDocument();
  });

  it('opens the whole record from a row, and closes it again', async () => {
    renderWithProviders(<RecordsPage />);

    await userEvent.click((await screen.findByText('Ada Lovelace')).closest('tr')!);

    const dialog = await screen.findByRole('dialog', { name: /ada lovelace/i });
    expect(dialog).toHaveTextContent('Headaches for two weeks');

    await userEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The list is still there, where the doctor left it.
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('opens a record from the keyboard', async () => {
    renderWithProviders(<RecordsPage />);

    const row = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    row.focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: /ada lovelace/i })).toBeInTheDocument();
  });

  it('pages through the records', async () => {
    serve([record('r1', 'Ada Lovelace')], { page: 1, total: 45, totalPages: 3 });
    renderWithProviders(<RecordsPage />);
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(pageRequests().at(-1)).toEqual({ page: 2, limit: 20 }));
  });

  it('shows a patient who has been deleted as unknown instead of crashing', async () => {
    serve([record('r1', 'x', { patient: null as never })]);
    renderWithProviders(<RecordsPage />);

    expect(await screen.findByText('Unknown patient')).toBeInTheDocument();
  });

  it('shows the MRN alone for a patient with no name on file', async () => {
    serve([
      record('r1', 'x', {
        patient: { id: 'p1', medicalRecordNumber: 'MRN-0042', user: 'u-1' } as never,
      }),
    ]);
    renderWithProviders(<RecordsPage />);

    const cell = (await screen.findByText('MRN-0042')).closest('tr')!;
    expect(within(cell).getAllByText('MRN-0042')).toHaveLength(1);
  });

  it('invites the first consultation when there are no records', async () => {
    serve([]);
    renderWithProviders(<RecordsPage />);

    expect(await screen.findByText(/no consultations recorded yet/i)).toBeInTheDocument();
    // An invitation, not a table of column headings over nothing.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    client.page.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
    renderWithProviders(<RecordsPage />);

    expect(await screen.findByText(/couldn’t load your records/i)).toBeInTheDocument();

    serve();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });
});
