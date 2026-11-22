import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import { bill, pageOf, routes } from '../test-fixtures';
import { MyBillsView } from './MyBillsView';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const BILLS = '/bills/patient/me';

type Params = Record<string, unknown> | undefined;

/** Answers the patient's own bills route; `all` is what an unfiltered read gets. */
function setup({
  open = pageOf([bill('a', 10_000, 2_500)]),
  all = pageOf([bill('a', 10_000, 2_500), bill('b', 4_000, 4_000, { status: 'paid' })]),
}: { open?: unknown; all?: unknown } = {}) {
  client.page.mockImplementation(
    routes({
      [BILLS]: (config?: { params?: Record<string, unknown> }) => (config?.params?.open ? open : all),
    })
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderView(route = '/app/billing') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/app/billing" element={<MyBillsView />} />
      </Routes>
      <Where />
    </>,
    { route }
  );
}

const tab = (name: RegExp) => screen.findByRole('tab', { name });

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe('MyBillsView', () => {
  it('titles the page Billing', async () => {
    renderView();

    expect(await screen.findByRole('heading', { level: 1, name: /^billing$/i })).toBeInTheDocument();
  });

  describe('what it asks for', () => {
    it('reads only the patient\'s own route, never the staff /bills list', async () => {
      renderView();
      await screen.findByText('INV-a');

      expect(client.page).toHaveBeenCalled();
      for (const [path] of client.page.mock.calls) expect(path).toBe(BILLS);
    });

    it('asks for open bills on "To pay"', async () => {
      renderView();
      await screen.findByText('INV-a');

      expect(client.page).toHaveBeenCalledWith(
        BILLS,
        expect.objectContaining({ params: expect.objectContaining({ open: true }) })
      );
    });

    it('asks for every bill on "All bills", with no open filter', async () => {
      renderView('/app/billing?tab=all');
      await screen.findByText('INV-b');

      const params = client.page.mock.calls.map(([, config]) => (config as { params: Params }).params);
      expect(params.every((p) => p?.open === undefined)).toBe(true);
    });
  });

  describe('the tabs', () => {
    it('starts on "To pay"', async () => {
      renderView();

      expect(await tab(/^to pay$/i)).toHaveAttribute('aria-selected', 'true');
      expect(await tab(/^all bills$/i)).toHaveAttribute('aria-selected', 'false');
    });

    it('starts on "All bills" when the address says so', async () => {
      renderView('/app/billing?tab=all');

      expect(await tab(/^all bills$/i)).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps the chosen tab in the address, so a refresh stays put', async () => {
      renderView();

      await userEvent.click(await tab(/^all bills$/i));

      expect(screen.getByTestId('where')).toHaveTextContent('/app/billing?tab=all');
      expect(await screen.findByText('INV-b')).toBeInTheDocument();
    });

    it('drops the parameter again on "To pay", the default', async () => {
      renderView('/app/billing?tab=all');

      await userEvent.click(await tab(/^to pay$/i));

      expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/billing$/);
    });

    it('falls back to "To pay" for a tab it does not know', async () => {
      renderView('/app/billing?tab=nonsense');

      expect(await tab(/^to pay$/i)).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('a bill', () => {
    it('shows the invoice number, issue date and the three amounts', async () => {
      renderView();

      const row = (await screen.findByText('INV-a')).closest('li') as HTMLElement;
      expect(within(row).getByText('INV-a')).toBeInTheDocument();
      expect(within(row).getByText(/\$100\.00/)).toBeInTheDocument();
      expect(within(row).getByText(/\$25\.00/)).toBeInTheDocument();
    });

    it('works the balance out as total less paid, not from a server field', async () => {
      renderView();

      const row = (await screen.findByText('INV-a')).closest('li') as HTMLElement;
      expect(row).toHaveTextContent(/balance\s*\$75\.00/i);
    });

    it('says the status in words', async () => {
      renderView();

      const row = (await screen.findByText('INV-a')).closest('li') as HTMLElement;
      expect(within(row).getByText('Part paid')).toBeInTheDocument();
    });

    it('says "Cancelled" for a void bill and owes nothing on it', async () => {
      setup({ all: pageOf([bill('v', 5_000, 0, { status: 'void' })]) });
      renderView('/app/billing?tab=all');

      const row = (await screen.findByText('INV-v')).closest('li') as HTMLElement;
      expect(within(row).getByText('Cancelled')).toBeInTheDocument();
      expect(row).toHaveTextContent(/balance\s*\$0\.00/i);
    });

    it('says when it is due', async () => {
      setup({
        open: pageOf([bill('a', 10_000, 0, { dueDate: new Date(2099, 0, 5).toISOString() })]),
      });
      renderView();

      expect(await screen.findByText(/^due /i)).not.toHaveTextContent(/overdue/i);
    });

    it('says overdue in words, in plain ink, never red', async () => {
      setup({
        open: pageOf([bill('a', 10_000, 0, { dueDate: new Date(2020, 0, 5).toISOString() })]),
      });
      const { container } = renderView();

      const line = await screen.findByText(/due .*, overdue/i);
      expect(line.className).not.toMatch(/danger|red/);
      expect(container.querySelector('[class*="text-danger"], [class*="bg-danger"]')).toBeNull();
    });

    it('never paints a balance red, however large', async () => {
      setup({ open: pageOf([bill('a', 9_999_999, 0)]) });
      const { container } = renderView();

      await screen.findByText('INV-a');
      expect(container.querySelector('[class*="danger"]')).toBeNull();
    });
  });

  describe('opening a bill', () => {
    const open = async () => {
      renderView();
      const button = await screen.findByRole('button', { name: /inv-a/i });
      await userEvent.click(button);
      return button;
    };

    beforeEach(() => {
      setup({
        open: pageOf([
          bill('a', 12_000, 2_000, {
            items: [
              { description: 'Consultation', quantity: 1, unitPriceCents: 8_000, amountCents: 8_000 },
              { description: 'Blood panel', quantity: 2, unitPriceCents: 2_000, amountCents: 4_000 },
            ],
            payments: [
              { amountCents: 2_000, method: 'card', receivedAt: new Date(2026, 10, 12).toISOString() },
            ],
          }),
        ]),
      });
    });

    it('is closed until asked', async () => {
      renderView();

      const button = await screen.findByRole('button', { name: /inv-a/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Consultation')).not.toBeInTheDocument();
    });

    it('shows the line items it came with, with no second request', async () => {
      const button = await open();

      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(await screen.findByText('Consultation')).toBeInTheDocument();
      expect(screen.getByText('Blood panel')).toBeInTheDocument();
      expect(client.get).not.toHaveBeenCalled();
    });

    it('shows what has been paid, and how', async () => {
      await open();

      const payments = await screen.findByRole('list', { name: /payments/i });
      expect(within(payments).getByText(/card/i)).toBeInTheDocument();
      expect(within(payments).getByText(/\$20\.00/)).toBeInTheDocument();
    });

    it('closes again', async () => {
      const button = await open();
      await userEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'false');
      await waitFor(() => expect(screen.queryByText('Consultation')).not.toBeInTheDocument());
    });
  });

  describe('how to pay', () => {
    const panel = () => screen.findByRole('region', { name: /how to pay/i });

    it('says to pay at the front desk and quote the invoice number', async () => {
      renderView();

      const region = await panel();
      expect(within(region).getByText(/front desk/i)).toBeInTheDocument();
      expect(within(region).getByText(/card or cash/i)).toBeInTheDocument();
      expect(within(region).getByText(/invoice number/i)).toBeInTheDocument();
    });

    it('offers no online payment button', async () => {
      renderView();
      await panel();

      expect(
        screen.queryByRole('button', { name: /pay now|pay online|pay this|pay bill/i })
      ).not.toBeInTheDocument();
    });

    it('sits above the list when something is to pay', async () => {
      renderView();

      const region = await panel();
      const list = await screen.findByRole('list', { name: /bills/i });
      expect(region.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sits below the list when nothing is to pay', async () => {
      setup({ all: pageOf([bill('b', 4_000, 4_000, { status: 'paid' })]) });
      renderView('/app/billing?tab=all');

      const list = await screen.findByRole('list', { name: /bills/i });
      const region = await panel();
      expect(list.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('states', () => {
    it('says "You\'re all paid up." when nothing is to pay', async () => {
      setup({ open: pageOf([]) });
      renderView();

      expect(await screen.findByText("You're all paid up.")).toBeInTheDocument();
    });

    it('says "No bills yet." when there are none at all', async () => {
      setup({ all: pageOf([]) });
      renderView('/app/billing?tab=all');

      expect(await screen.findByText('No bills yet.')).toBeInTheDocument();
    });

    it('shows a loading status while the bills load', () => {
      client.page.mockImplementation(routes({ [BILLS]: () => new Promise(() => {}) }));
      renderView();

      expect(screen.getByRole('status', { name: /loading your bills/i })).toBeInTheDocument();
    });

    it('offers a retry when the bills fail to load', async () => {
      client.page.mockImplementation(
        routes({
          [BILLS]: () => {
            throw new ApiError('INTERNAL_ERROR', 'boom', 500);
          },
        })
      );
      renderView();

      expect(await screen.findByText(/couldn't load your bills/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('sends a patient with no patient record to the front desk', async () => {
      client.page.mockImplementation(
        routes({
          [BILLS]: () => {
            throw new ApiError('NOT_FOUND', 'none', 404);
          },
        })
      );
      renderView();

      expect(
        await screen.findByText(/we couldn't find your patient record\. please contact the front desk\./i)
      ).toBeInTheDocument();
    });
  });

  describe('paging', () => {
    it('asks for the next page and goes back to the first when the tab changes', async () => {
      setup({
        open: pageOf([bill('a', 100, 0)], { page: 1, limit: 20, total: 45, totalPages: 3 }),
      });
      renderView();

      await userEvent.click(await screen.findByRole('button', { name: /next page/i }));

      await waitFor(() =>
        expect(client.page).toHaveBeenCalledWith(
          BILLS,
          expect.objectContaining({ params: expect.objectContaining({ page: 2 }) })
        )
      );

      await userEvent.click(await tab(/^all bills$/i));
      await waitFor(() => {
        const last = client.page.mock.calls.at(-1)?.[1] as { params: Params };
        expect(last.params?.page).toBe(1);
      });
    });
  });
});
