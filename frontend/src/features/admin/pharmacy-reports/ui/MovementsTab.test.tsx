import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import type { ActorRef, StockMovement, StockReport } from '../api/reports-api';
import { PharmacyReportsPage } from './PharmacyReportsPage';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const MEDICINE_ID = '64b7f0c2a1d3e4f5a6b7c8d9';
const ACTOR_ID = '64b7f0c2a1d3e4f5a6b7c8da';

const asha: ActorRef = { id: ACTOR_ID, name: 'Asha Rao', role: 'pharmacist' };

function movement(over: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mv1',
    createdAt: '2026-11-20T09:30:00.000Z',
    kind: 'restock',
    delta: 120,
    onHand: 160,
    reason: 'Weekly delivery',
    medicine: { id: MEDICINE_ID, name: 'Paracetamol 500', batchNumber: 'PCM-0042', unit: 'tablet' },
    actor: asha,
    ...over,
  };
}

function pageOf(items: StockMovement[], pagination: Partial<{ page: number; total: number }> = {}) {
  const total = pagination.total ?? items.length;
  return {
    items,
    pagination: { page: pagination.page ?? 1, limit: 25, total, totalPages: Math.max(Math.ceil(total / 25), 1) },
  };
}

/** Lets a test read the URL the page wrote. */
function Location() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderTab(query = '') {
  return renderWithProviders(
    <>
      <PharmacyReportsPage />
      <Location />
    </>,
    { route: `/?tab=movements${query}` }
  );
}

const searchOf = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');

const lastRequest = () => vi.mocked(api.page).mock.calls.at(-1)?.[1]?.params as Record<string, unknown>;

function mockGet(byPath: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path in byPath) return byPath[path];
    throw new ApiError('NOT_FOUND', 'Not found.', 404);
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset();
  vi.mocked(api.page).mockResolvedValue(pageOf([movement()]));
});

describe('Movements tab — the request', () => {
  it('asks for the newest 25 with no filters at all', async () => {
    renderTab();

    await screen.findByRole('table', { name: 'Stock movements' });

    expect(api.page).toHaveBeenCalledTimes(1);
    expect(api.page).toHaveBeenCalledWith('/medicines/stock-movements', {
      params: { page: 1, limit: 25, sort: '-createdAt' },
    });
  });

  it('sends the filters it finds in the URL, and the page', async () => {
    mockGet({ [`/users/${ACTOR_ID}`]: { ...asha, email: 'a@x.com' }, [`/medicines/${MEDICINE_ID}`]: { id: MEDICINE_ID, name: 'Paracetamol 500' } });
    renderTab(`&kind=adjust&medicine=${MEDICINE_ID}&actor=${ACTOR_ID}&page=2`);

    await screen.findByRole('table', { name: 'Stock movements' });

    expect(lastRequest()).toEqual({
      page: 2,
      limit: 25,
      sort: '-createdAt',
      kind: 'adjust',
      medicine: MEDICINE_ID,
      actor: ACTOR_ID,
    });
  });

  it('turns the From and To days into the start and end of those local days', async () => {
    renderTab('&from=2026-11-03&to=2026-11-03');

    await screen.findByRole('table', { name: 'Stock movements' });

    expect(lastRequest().from).toBe(new Date(2026, 10, 3, 0, 0, 0, 0).toISOString());
    expect(lastRequest().to).toBe(new Date(2026, 10, 3, 23, 59, 59, 999).toISOString());
  });

  it('ignores an unknown kind and takes it out of the URL', async () => {
    renderTab('&kind=theft');

    await screen.findByRole('table', { name: 'Stock movements' });

    expect(lastRequest()).not.toHaveProperty('kind');
    await waitFor(() => expect(searchOf().has('kind')).toBe(false));
    expect(searchOf().get('tab')).toBe('movements');
  });
});

describe('Movements tab — the table', () => {
  it('shows when, medicine and batch, signed change, balance, kind, reason and who', async () => {
    renderTab();

    await screen.findByText('Weekly delivery');
    const row = within(screen.getByRole('table', { name: 'Stock movements' })).getAllByRole('row')[1]!;

    expect(within(row).getByTitle('2026-11-20T09:30:00.000Z')).toBeInTheDocument();
    expect(row).toHaveTextContent('Paracetamol 500');
    expect(row).toHaveTextContent('PCM-0042');
    expect(row).toHaveTextContent('+120 tablets');
    expect(row).toHaveTextContent('160 tablets');
    expect(row).toHaveTextContent('Restock');
    expect(row).toHaveTextContent('Weekly delivery');
    expect(row).toHaveTextContent('Asha Rao');
    expect(row).toHaveTextContent('Pharmacist');
  });

  it('writes a decrease with a minus sign and the label staff use', async () => {
    vi.mocked(api.page).mockResolvedValue(
      pageOf([
        movement({
          id: 'mv2',
          kind: 'withdrawn',
          delta: -4,
          onHand: 0,
          medicine: { id: MEDICINE_ID, name: 'Saline', batchNumber: 'S-1', unit: 'ml' },
        }),
      ])
    );
    renderTab();

    await screen.findByText('Saline');
    const row = screen.getAllByRole('row')[1]!;

    expect(row).toHaveTextContent('−4 ml');
    expect(row).toHaveTextContent('Written off');
  });

  it('copes with a removed user, a removed medicine and no reason', async () => {
    vi.mocked(api.page).mockResolvedValue(
      pageOf([movement({ id: 'mv3', actor: null, medicine: null, reason: undefined, kind: 'dispense', delta: -2 })])
    );
    renderTab();

    await screen.findByText('Removed medicine');
    const row = screen.getAllByRole('row')[1]!;

    expect(row).toHaveTextContent('Removed user');
    expect(row).toHaveTextContent('Removed medicine');
    expect(row).toHaveTextContent('Dispensed');
    expect(row).toHaveTextContent('−2');
  });

  it('shows skeleton rows on the first load, not an empty table', () => {
    vi.mocked(api.page).mockReturnValue(new Promise(() => undefined));
    renderTab();

    const table = screen.getByRole('table', { name: 'Stock movements' });

    expect(table.closest('[aria-busy="true"]')).not.toBeNull();
    expect(within(table).queryByText('Weekly delivery')).not.toBeInTheDocument();
  });

  it('goes to the next page and keeps it in the URL', async () => {
    vi.mocked(api.page).mockResolvedValue(pageOf([movement()], { total: 60 }));
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(lastRequest().page).toBe(2));
    expect(searchOf().get('page')).toBe('2');
  });

  it('keeps the old rows on screen while a new filter loads', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Weekly delivery');

    vi.mocked(api.page).mockReturnValue(new Promise(() => undefined));
    await user.click(screen.getByRole('button', { name: 'Dispensed' }));

    expect(screen.getByText('Weekly delivery')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument();
  });
});

describe('Movements tab — the filters', () => {
  it('offers All and the six kinds, and marks the one in use', async () => {
    renderTab('&kind=restored');
    const group = await screen.findByRole('group', { name: 'Kind' });

    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(names).toEqual(['All', 'Restock', 'Dispensed', 'Adjusted', 'Given to patient', 'Returned to stock', 'Written off']);
    expect(within(group).getByRole('button', { name: 'Returned to stock' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters by kind, writes it to the URL, and "All" takes it away again', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('table', { name: 'Stock movements' });

    await user.click(screen.getByRole('button', { name: 'Adjusted' }));
    await waitFor(() => expect(lastRequest().kind).toBe('adjust'));
    expect(searchOf().get('kind')).toBe('adjust');

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(lastRequest()).not.toHaveProperty('kind'));
    expect(searchOf().has('kind')).toBe(false);
  });

  it('goes back to page 1 when a filter changes', async () => {
    vi.mocked(api.page).mockResolvedValue(pageOf([movement()], { total: 100, page: 3 }));
    const user = userEvent.setup();
    renderTab('&page=3');
    await screen.findByRole('table', { name: 'Stock movements' });
    expect(lastRequest().page).toBe(3);

    await user.click(screen.getByRole('button', { name: 'Restock' }));

    await waitFor(() => expect(lastRequest().kind).toBe('restock'));
    expect(lastRequest().page).toBe(1);
    expect(searchOf().has('page')).toBe(false);
  });

  it('filters by date', async () => {
    renderTab();
    await screen.findByRole('table', { name: 'Stock movements' });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });

    await waitFor(() => expect(lastRequest().from).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString()));
    expect(searchOf().get('from')).toBe('2026-11-01');
  });

  it('sends nothing, and says why on the To field, when the dates run backwards', async () => {
    renderTab('&from=2026-11-20&to=2026-11-01');

    expect(await screen.findByText('End date must be on or after the start date.')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInvalid();
    expect(api.page).not.toHaveBeenCalled();
  });

  it('sends the request again once the range is fixed', async () => {
    renderTab('&from=2026-11-20&to=2026-11-01');
    await screen.findByText('End date must be on or after the start date.');

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-25' } });

    await waitFor(() => expect(api.page).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('End date must be on or after the start date.')).not.toBeInTheDocument();
  });

  it('names the medicine in the URL as a chip, and clears it', async () => {
    mockGet({ [`/medicines/${MEDICINE_ID}`]: { id: MEDICINE_ID, name: 'Paracetamol 500' } });
    const user = userEvent.setup();
    renderTab(`&medicine=${MEDICINE_ID}`);

    const clear = await screen.findByRole('button', { name: 'Clear Medicine: Paracetamol 500' });
    expect(api.get).toHaveBeenCalledWith(`/medicines/${MEDICINE_ID}`);

    await user.click(clear);

    await waitFor(() => expect(lastRequest()).not.toHaveProperty('medicine'));
    expect(searchOf().has('medicine')).toBe(false);
  });

  it('still lets a medicine that can no longer be found be cleared', async () => {
    mockGet({});
    renderTab(`&medicine=${MEDICINE_ID}`);

    expect(await screen.findByRole('button', { name: 'Clear Medicine: Unknown medicine' })).toBeInTheDocument();
  });

  it('names the person in the URL as a chip', async () => {
    mockGet({ [`/users/${ACTOR_ID}`]: { ...asha, email: 'a@x.com' } });
    renderTab(`&actor=${ACTOR_ID}`);

    expect(await screen.findByRole('button', { name: 'Clear Person: Asha Rao' })).toBeInTheDocument();
  });

  it('picks a medicine from a search and filters by it', async () => {
    vi.mocked(api.page).mockImplementation(async (path: string) => {
      if (path === '/medicines') {
        return {
          items: [
            {
              id: MEDICINE_ID,
              name: 'Paracetamol 500',
              batchNumber: 'PCM-0042',
              quantity: 120,
              unit: 'tablet',
              isActive: true,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        };
      }
      return pageOf([movement()]);
    });
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('table', { name: 'Stock movements' });

    await user.type(screen.getByRole('combobox', { name: 'Medicine' }), 'para');
    await user.click(await screen.findByRole('option', { name: /PCM-0042/ }));

    await waitFor(() => expect(searchOf().get('medicine')).toBe(MEDICINE_ID));
    expect(screen.getByRole('button', { name: 'Clear Medicine: Paracetamol 500' })).toBeInTheDocument();
    // The chosen medicine's name is already known, so it is not fetched again.
    expect(api.get).not.toHaveBeenCalled();
  });

  it('shows "Clear filters" only while a filter is set, and it clears them all', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('table', { name: 'Stock movements' });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restock' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(lastRequest()).toEqual({ page: 1, limit: 25, sort: '-createdAt' }));
    expect(searchOf().toString()).toBe('tab=movements');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});

describe('Movements tab — empty and error', () => {
  it('invites the first movement when there are none and no filters', async () => {
    vi.mocked(api.page).mockResolvedValue(pageOf([]));
    renderTab();

    expect(await screen.findByText('No stock movements yet.')).toBeInTheDocument();
    expect(screen.getByText('Restocks, dispenses and adjustments will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('says nothing matches when filters are set, and offers to clear them', async () => {
    vi.mocked(api.page).mockResolvedValue(pageOf([]));
    const user = userEvent.setup();
    renderTab('&kind=restock');

    expect(await screen.findByText('No movements match these filters.')).toBeInTheDocument();
    // The bar's own button and the empty state's: either clears.
    const buttons = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);

    vi.mocked(api.page).mockResolvedValue(pageOf([movement()]));
    await user.click(buttons[buttons.length - 1]!);

    expect(await screen.findByText('Weekly delivery')).toBeInTheDocument();
  });

  it('shows the server text and retries', async () => {
    vi.mocked(api.page).mockRejectedValueOnce(new ApiError('LEDGER_DOWN', 'The ledger is unavailable.', 500));
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('The ledger is unavailable.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Weekly delivery')).toBeInTheDocument();
  });
});

describe('Pharmacy reports — from the stock report to the movements', () => {
  function stockReport(): StockReport {
    return {
      window: { from: '2026-10-24T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z', days: 30 },
      alertRecipients: [],
      restockedBy: [],
      lowStock: [
        {
          id: MEDICINE_ID,
          name: 'Paracetamol 500',
          batchNumber: 'PCM-0042',
          quantity: 3,
          unit: 'tablet',
          reorderLevel: 40,
          price: 2,
          expiryDate: '2027-06-30T00:00:00.000Z',
          requiresPrescription: false,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastRestock: null,
        },
      ],
    } as StockReport;
  }

  it('"See movements" opens the Movements tab filtered to that medicine', async () => {
    mockGet({
      '/medicines/stock-report': stockReport(),
      [`/medicines/${MEDICINE_ID}`]: { id: MEDICINE_ID, name: 'Paracetamol 500' },
    });
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PharmacyReportsPage />
        <Location />
      </>
    );

    await user.click(await screen.findByRole('link', { name: /See movements for Paracetamol 500/ }));

    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(lastRequest().medicine).toBe(MEDICINE_ID));
    expect(await screen.findByRole('button', { name: 'Clear Medicine: Paracetamol 500' })).toBeInTheDocument();
  });

  it('returns to a clean stock report, leaving the movement filters behind', async () => {
    mockGet({ '/medicines/stock-report': stockReport() });
    const user = userEvent.setup();
    renderTab('&kind=restock');
    await screen.findByRole('table', { name: 'Stock movements' });

    await user.click(screen.getByRole('tab', { name: 'Stock report' }));

    await screen.findByRole('heading', { name: 'Low stock right now' });
    expect(searchOf().toString()).toBe('');
  });
});
