import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { toast } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { batch } from '../test-fixtures';
import { ExpiryPage } from './ExpiryPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

// 16:12 in the pinned test timezone (Asia/Dhaka, UTC+6).
const NOW = new Date('2026-11-22T10:12:00.000Z');

const EXPIRED = [
  batch('e1', '2026-11-02T00:00:00.000Z', { name: 'Amoxicillin 250 mg', unit: 'capsule', quantity: 120 }),
  batch('e2', '2026-11-20T00:00:00.000Z', { name: 'Saline 0.9%', unit: 'bottle', quantity: 190 }),
];
const SOON = [
  batch('s1', '2026-11-25T00:00:00.000Z', { name: 'Insulin glargine', unit: 'vial', quantity: 6 }),
  batch('s2', '2026-12-01T00:00:00.000Z', { name: 'Paracetamol 500 mg', unit: 'tablet', quantity: 400 }),
];

function shelf(list: unknown[]) {
  client.get.mockImplementation((async (path: string) => {
    if (path === '/medicines/expiring') return list;
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

function renderPage(route = '/app/pharmacy/expiry') {
  return renderWithProviders(<ExpiryPage />, { route });
}

function expiringRequests() {
  return client.get.mock.calls
    .filter(([path]) => path === '/medicines/expiring')
    .map(([, config]) => (config as { params?: { days?: number } }).params?.days);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
  shelf([...EXPIRED, ...SOON]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpiryPage', () => {
  it('shows a skeleton while the list loads', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Expiry' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading expiry list' })).toBeInTheDocument();
  });

  it('lists expired batches with their totals, and the rest as expiring', async () => {
    renderPage();

    const expired = await screen.findByRole('region', { name: 'Expired batches' });
    expect(within(expired).getByText(/2 batches/)).toBeInTheDocument();
    expect(within(expired).getByText('310 units')).toBeInTheDocument();
    expect(within(expired).getByText('Amoxicillin 250 mg')).toBeInTheDocument();
    expect(within(expired).getByText('B-E1')).toBeInTheDocument();
    // The unit travels with the number: a bare "120" is ambiguous.
    expect(within(expired).getByText('120 capsules')).toBeInTheDocument();
    expect(within(expired).getByText(formatDate(EXPIRED[0]!.expiryDate))).toBeInTheDocument();

    const soon = screen.getByRole('region', { name: 'Expiring soon' });
    expect(within(soon).getByText('Expiring in the next 30 days')).toBeInTheDocument();
    expect(within(soon).getByText('2 batches')).toBeInTheDocument();
    const rows = within(soon).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Insulin glargine');
    expect(rows[1]).toHaveTextContent('Paracetamol 500 mg');
  });

  it('says both when it expires and how far off that is', async () => {
    renderPage();
    const soon = await screen.findByRole('region', { name: 'Expiring soon' });
    const [first, second] = within(soon).getAllByRole('listitem');

    expect(first).toHaveTextContent(formatDate(SOON[0]!.expiryDate));
    expect(first).toHaveTextContent('in 3 days');
    expect(second).toHaveTextContent(formatDate(SOON[1]!.expiryDate));
    expect(second).toHaveTextContent('in 9 days');
  });

  it('flags only batches expiring within a week', async () => {
    renderPage();
    const soon = await screen.findByRole('region', { name: 'Expiring soon' });
    const [first, second] = within(soon).getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(first).getByText('Expires soon')).toBeInTheDocument();
    expect(within(second).queryByText('Expires soon')).not.toBeInTheDocument();
  });

  it('draws no expired panel and no all-clear banner when nothing has expired', async () => {
    shelf(SOON);
    renderPage();

    await screen.findByRole('region', { name: 'Expiring soon' });
    expect(screen.queryByRole('region', { name: 'Expired batches' })).not.toBeInTheDocument();
    expect(screen.queryByText(/withdraw expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument();
  });

  it('asks the server for the look-ahead in the URL, 30 days by default', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Expiring soon' });
    expect(expiringRequests()).toEqual([30]);
  });

  it('follows ?days= and keeps the choice in the URL', async () => {
    const user = userEvent.setup();
    renderPage('/app/pharmacy/expiry?days=7');
    await screen.findByRole('region', { name: 'Expiring soon' });
    expect(expiringRequests()).toEqual([7]);
    expect(screen.getByRole('combobox', { name: 'Look ahead' })).toHaveValue('7');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Look ahead' }), '90');
    await waitFor(() => expect(expiringRequests()).toContain(90));
    expect(await screen.findByText('Expiring in the next 90 days')).toBeInTheDocument();
  });

  it('ignores a look-ahead it does not offer', async () => {
    renderPage('/app/pharmacy/expiry?days=9999');
    await screen.findByRole('region', { name: 'Expiring soon' });
    expect(expiringRequests()).toEqual([30]);
  });

  it('says nothing is due, and offers a longer look, when the shelf is clear', async () => {
    const user = userEvent.setup();
    shelf([]);
    renderPage();

    expect(await screen.findByText('Nothing expires in the next 30 days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Look 90 days ahead' }));

    expect(await screen.findByText('Nothing expires in the next 90 days.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /look 90 days ahead/i })).not.toBeInTheDocument();
  });

  it('shows an error with a retry, and recovers', async () => {
    const user = userEvent.setup();
    client.get.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the expiry list');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'Expiring soon' })).toBeInTheDocument();
  });
});

describe('writing off', () => {
  async function openDialog() {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Withdraw expired…' }));
    return { user, dialog: await screen.findByRole('dialog') };
  }

  it('lists exactly what will be written off, with a danger action that names the units', async () => {
    const { dialog } = await openDialog();

    expect(within(dialog).getByText('Write off 2 expired batches?')).toBeInTheDocument();
    expect(within(dialog).getByText('Amoxicillin 250 mg')).toBeInTheDocument();
    expect(within(dialog).getByText('120 capsules')).toBeInTheDocument();
    expect(within(dialog).getByText('Saline 0.9%')).toBeInTheDocument();
    expect(within(dialog).getByText('190 bottles')).toBeInTheDocument();
    expect(within(dialog).getByText(/recorded against your name and can’t be undone here/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Write off 310 units' })).toBeInTheDocument();
  });

  it('puts focus on Cancel, not on the destructive button', async () => {
    const { dialog } = await openDialog();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('does nothing when cancelled', async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Expired batches' })).toBeInTheDocument();
  });

  it('reports the server’s numbers, removes the expired panel, and notes who did it', async () => {
    client.post.mockResolvedValue({
      withdrawn: 2,
      units: 310,
      items: [EXPIRED[0], EXPIRED[1]],
    } as never);
    const { user, dialog } = await openDialog();

    // After the write-off the refetch sees nothing expired.
    shelf(SOON);
    await user.click(within(dialog).getByRole('button', { name: 'Write off 310 units' }));

    expect(client.post).toHaveBeenCalledWith('/medicines/withdraw-expired', {});
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Wrote off 310 units across 2 batches')
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Expired batches' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Written off today at .+ by you/);
    // The rest of the page is untouched.
    expect(screen.getByRole('region', { name: 'Expiring soon' })).toBeInTheDocument();
  });

  it('uses the server’s set when it differs from the dialog’s', async () => {
    // Saline was dispensed after the dialog opened, so the server skipped it.
    client.post.mockResolvedValue({ withdrawn: 1, units: 120, items: [EXPIRED[0]] } as never);
    const { user, dialog } = await openDialog();

    shelf([EXPIRED[1], ...SOON]);
    await user.click(within(dialog).getByRole('button', { name: 'Write off 310 units' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Wrote off 120 units across 1 batch')
    );
    const expired = await screen.findByRole('region', { name: 'Expired batches' });
    expect(within(expired).getByText('Saline 0.9%')).toBeInTheDocument();
    expect(within(expired).queryByText('Amoxicillin 250 mg')).not.toBeInTheDocument();
  });

  it('says so when there was nothing left to write off, and leaves no note', async () => {
    client.post.mockResolvedValue({ withdrawn: 0, units: 0, items: [] } as never);
    const { user, dialog } = await openDialog();

    shelf(SOON);
    await user.click(within(dialog).getByRole('button', { name: 'Write off 310 units' }));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        'Nothing to write off. Those batches were already withdrawn.'
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/Written off today/)).not.toBeInTheDocument();
  });

  it('keeps the dialog open and says what failed', async () => {
    client.post.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Write off 310 units' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t write off the expired stock. Try again.'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Radix hides the page behind an open dialog from the accessibility tree.
    expect(screen.getByRole('region', { name: 'Expired batches', hidden: true })).toBeInTheDocument();
    expect(screen.queryByText(/Written off today/)).not.toBeInTheDocument();
  });

  it('disables both buttons while the write-off runs', async () => {
    client.post.mockReturnValue(new Promise(() => undefined) as never);
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Write off 310 units' }));

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled());
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('agrees to the list that was on screen when it opened, not a later refetch', async () => {
    const { dialog } = await openDialog();
    shelf([EXPIRED[0], ...SOON]);
    await screen.findByRole('dialog');

    expect(within(dialog).getByText('Write off 2 expired batches?')).toBeInTheDocument();
  });
});
