import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, formatTime } from '@/shared/lib/format';
import { toast } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { arrival, bed, pageOf, patientWithName } from '../test-fixtures';
import { FrontDeskPage } from './FrontDeskPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const NOW = new Date('2026-11-22T10:12:00.000Z');
type Config = { params?: Record<string, unknown> };

interface Setup {
  arrivals?: unknown | ((config?: Config) => unknown);
  wards?: string[];
  free?: unknown[];
  patient?: unknown | ((mrn: string) => unknown);
}

function setup({
  arrivals = pageOf([
    arrival('a1', 'Jide Okafor', { status: 'confirmed', scheduledAt: '2026-11-22T09:00:00.000Z' }),
    arrival('a2', 'Amina Yusuf', { status: 'pending', scheduledAt: '2026-11-22T10:30:00.000Z' }),
  ]),
  wards = ['Ward A', 'Ward B'],
  free = [bed('1', 'Ward A'), bed('2', 'Ward A'), bed('3', 'Ward A')],
  patient = patientWithName('Amina Yusuf'),
}: Setup = {}) {
  client.page.mockImplementation((async (path: string, config?: Config) => {
    if (path !== '/appointments') throw new Error(`Unmocked page: ${path}`);
    return typeof arrivals === 'function' ? (arrivals as (c?: Config) => unknown)(config) : arrivals;
  }) as never);

  client.get.mockImplementation((async (path: string) => {
    if (path === '/beds/wards') return wards;
    if (path === '/beds/available') return free;
    if (path.startsWith('/patients/mrn/')) {
      const mrn = decodeURIComponent(path.replace('/patients/mrn/', ''));
      const answer = typeof patient === 'function' ? (patient as (m: string) => unknown)(mrn) : patient;
      if (answer instanceof Error) throw answer;
      return answer;
    }
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function renderPage(route = '/app/front-desk') {
  return renderWithProviders(<FrontDeskPage />, { route });
}

function arrivalsRequests() {
  return client.page.mock.calls
    .filter(([path]) => path === '/appointments')
    .map(([, config]) => (config as Config).params);
}

function mrnRequests() {
  return client.get.mock.calls.filter(([path]) => String(path).startsWith('/patients/mrn/'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FrontDeskPage', () => {
  it('has a title and today’s date', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /front desk/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Today')).toBeInTheDocument();
  });

  describe('arrivals today', () => {
    it('lists the day’s visits with name, MRN, doctor and status', async () => {
      renderPage();

      const panel = await screen.findByRole('region', { name: /arrivals today/i });
      expect(await within(panel).findByText('Jide Okafor')).toBeInTheDocument();
      expect(within(panel).getByText('Amina Yusuf')).toBeInTheDocument();
      expect(within(panel).getByText('MRN-A2')).toBeInTheDocument();
      expect(within(panel).getAllByText('Dr Rao', { selector: 'span' })).toHaveLength(2);
      expect(within(panel).getByText('Confirmed', { selector: 'span' })).toBeInTheDocument();
      expect(within(panel).getByText('Pending', { selector: 'span' })).toBeInTheDocument();
      expect(within(panel).getAllByText('2 visits').length).toBeGreaterThan(0);
    });

    it('asks for today only, soonest first, twenty at a time', async () => {
      renderPage();
      await screen.findByText('Jide Okafor');

      const [params] = arrivalsRequests();
      expect(params).toMatchObject({ page: 1, limit: 20, sort: 'scheduledAt' });
      expect(new Date(params!.from as string).getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(new Date(params!.to as string).getTime()).toBeGreaterThan(NOW.getTime());
      expect(params).not.toHaveProperty('status');
      expect(params).not.toHaveProperty('doctor');
    });

    it('offers Confirm only on a pending visit', async () => {
      renderPage();

      await screen.findByText('Jide Okafor');
      expect(screen.getAllByRole('button', { name: /^confirm visit for/i })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Confirm visit for Amina Yusuf' })).toBeInTheDocument();
    });

    it('confirms a visit, says so, and disables the button while it runs', async () => {
      let finish: (value: unknown) => void = () => {};
      client.post.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderPage();

      const confirm = await screen.findByRole('button', { name: 'Confirm visit for Amina Yusuf' });
      await userEvent.click(confirm);

      expect(client.post).toHaveBeenCalledWith('/appointments/a2/confirm');
      await waitFor(() => expect(confirm).toBeDisabled());

      finish({ id: 'a2', status: 'confirmed' });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Visit confirmed for Amina Yusuf'));
    });

    it('treats a 409 as news, not a failure, and reloads the list', async () => {
      client.post.mockRejectedValue(new ApiError('CONFLICT', 'moved on', 409));
      renderPage();

      await userEvent.click(await screen.findByRole('button', { name: 'Confirm visit for Amina Yusuf' }));

      await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Already updated by a colleague'));
      expect(toast.error).not.toHaveBeenCalled();
      await waitFor(() => expect(arrivalsRequests().length).toBeGreaterThan(1));
    });

    it('draws the clock between the visit that has passed and the one still ahead', async () => {
      renderPage();

      const panel = await screen.findByRole('region', { name: /arrivals today/i });
      await within(panel).findByText('Jide Okafor');

      const rows = [...panel.querySelectorAll('li')];
      const at = (predicate: (row: Element) => boolean) => rows.findIndex(predicate);
      const marker = at((row) => row.getAttribute('role') === 'separator');
      expect(rows[marker]).toHaveAccessibleName(`Now, ${formatTime(NOW)}`);
      expect(at((row) => row.textContent?.includes('Jide Okafor') ?? false)).toBeLessThan(marker);
      expect(marker).toBeLessThan(at((row) => row.textContent?.includes('Amina Yusuf') ?? false));
    });

    it('says when nothing is booked', async () => {
      setup({ arrivals: pageOf([]) });
      renderPage();

      expect(await screen.findByText('No visits booked for today.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it('shows a skeleton while loading', () => {
      client.page.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByRole('status', { name: /loading arrivals/i })).toBeInTheDocument();
    });

    it('fails on its own, with a retry, and leaves the rest of the page up', async () => {
      setup({
        arrivals: () => {
          throw failure();
        },
      });
      renderPage();

      expect(await screen.findByText(/couldn’t load arrivals/i)).toBeInTheDocument();
      expect(await screen.findByText('Ward A')).toBeInTheDocument();

      setup();
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(await screen.findByText('Jide Okafor')).toBeInTheDocument();
    });

    it('names a visit whose patient record is gone', async () => {
      setup({ arrivals: pageOf([arrival('a1', null)]) });
      renderPage();

      expect(await screen.findByText('Name not on record')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('reads the status and doctor from the link and sends them', async () => {
      renderPage('/app/front-desk?status=pending&doctor=d-rao');

      await screen.findByText('Amina Yusuf');
      expect(arrivalsRequests()[0]).toMatchObject({ status: 'pending', doctor: 'd-rao' });
      expect(screen.getByRole('combobox', { name: /filter by status/i })).toHaveValue('pending');
    });

    it('sends a newly chosen status', async () => {
      renderPage();
      await screen.findByText('Jide Okafor');

      await userEvent.selectOptions(screen.getByRole('combobox', { name: /filter by status/i }), 'pending');

      await waitFor(() =>
        expect(arrivalsRequests().some((params) => params?.status === 'pending')).toBe(true)
      );
    });

    it('builds the doctor list from the visits it has seen', async () => {
      setup({
        arrivals: pageOf([
          arrival('a1', 'Jide Okafor', { doctor: { id: 'd-rao', name: 'Dr Rao' } as never }),
          arrival('a2', 'Amina Yusuf', { doctor: { id: 'd-ito', name: 'Dr Ito' } as never }),
        ]),
      });
      renderPage();

      await screen.findByText('Jide Okafor');
      const select = screen.getByRole('combobox', { name: /filter by doctor/i });
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'All doctors',
        'Dr Ito',
        'Dr Rao',
      ]);
    });

    it('tells a filtered-empty list from an empty day, and clears the filters', async () => {
      setup({
        arrivals: (config?: Config) =>
          config?.params?.status ? pageOf([]) : pageOf([arrival('a1', 'Jide Okafor')]),
      });
      renderPage('/app/front-desk?status=no_show');

      expect(await screen.findByText('No visits match these filters.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(await screen.findByText('Jide Okafor')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /filter by status/i })).toHaveValue('');
    });
  });

  describe('find a patient', () => {
    const box = () => screen.getByRole('textbox', { name: /find a patient by mrn/i });

    it('does nothing until the MRN is submitted', async () => {
      renderPage();

      await userEvent.type(box(), 'mrn-0042');

      expect(mrnRequests()).toHaveLength(0);
    });

    it('looks the patient up on Enter, in any case', async () => {
      renderPage();

      await userEvent.type(box(), '  mrn-004213 {Enter}');

      expect(await screen.findByText('MRN-004213')).toBeInTheDocument();
      expect(mrnRequests().map(([path]) => path)).toEqual(['/patients/mrn/MRN-004213']);
    });

    it('shows the name, birth date and where the patient is', async () => {
      setup({
        patient: patientWithName('Amina Yusuf', {
          isAdmitted: true,
          ward: 'Ward B',
          bed: { id: 'b1', bedNumber: 'B-12', ward: 'Ward B' },
        }),
      });
      renderPage('/app/front-desk?mrn=MRN-004213');

      // The arrivals list may also show this name, so look inside the lookup card.
      const card = screen.getByRole('region', { name: /find a patient/i });
      expect(await within(card).findByText('Amina Yusuf')).toBeInTheDocument();
      expect(
        within(card).getByText(new RegExp(`born ${formatDate('1988-03-04T00:00:00.000Z')}`, 'i'))
      ).toBeInTheDocument();
      expect(screen.getByText(/admitted · ward b · b-12/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open chart/i })).toHaveAttribute('href', '/app/patients/p-1');
      expect(screen.getByRole('link', { name: /^bills$/i })).toHaveAttribute(
        'href',
        '/app/billing?patient=p-1'
      );
    });

    it('says "not admitted" for a patient who is not in a bed', async () => {
      renderPage('/app/front-desk?mrn=MRN-004213');

      expect(await screen.findByText(/not admitted/i)).toBeInTheDocument();
    });

    it('shows the number, not a blank, when the name is missing', async () => {
      setup({ patient: patientWithName(null) });
      renderPage('/app/front-desk?mrn=MRN-004213');

      expect(await screen.findByText('Name not on record')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open chart/i })).toBeInTheDocument();
    });

    it('says no patient has that number, and leaves the text selected to retype', async () => {
      setup({ patient: new ApiError('NOT_FOUND', 'no such patient', 404) });
      renderPage();

      await userEvent.type(box(), 'MRN-000000{Enter}');

      expect(await screen.findByText(/no patient with mrn/i)).toHaveTextContent('MRN-000000');
      expect(box()).toHaveValue('MRN-000000');
      await waitFor(() => expect(box()).toHaveFocus());
      expect((box() as HTMLInputElement).selectionStart).toBe(0);
      expect((box() as HTMLInputElement).selectionEnd).toBe('MRN-000000'.length);
    });

    it('rejects something too long to be an MRN without asking the server', async () => {
      renderPage();

      await userEvent.type(box(), `MRN-${'1'.repeat(40)}{Enter}`);

      expect(await screen.findByText('That doesn’t look like an MRN.')).toBeInTheDocument();
      expect(mrnRequests()).toHaveLength(0);
    });

    it('shows the normalised number in the box once it is submitted', async () => {
      renderPage();

      await userEvent.type(box(), 'mrn-004213{Enter}');

      await screen.findByText('MRN-004213', { selector: 'span' });
      expect(box()).toHaveValue('MRN-004213');
    });

    it('says so when the lookup itself fails', async () => {
      setup({ patient: failure() });
      renderPage('/app/front-desk?mrn=MRN-004213');

      expect(await screen.findByText(/couldn’t look that up/i)).toBeInTheDocument();
    });
  });

  describe('free beds', () => {
    it('counts per ward, and says "0 free" for a full one', async () => {
      renderPage();

      const panel = await screen.findByRole('region', { name: /free beds/i });
      const wardA = await within(panel).findByRole('link', { name: /ward a/i });
      expect(wardA).toHaveTextContent('3 free');
      expect(wardA).toHaveAttribute('href', '/app/beds?ward=Ward%20A');

      const wardB = within(panel).getByRole('link', { name: /ward b/i });
      expect(wardB).toHaveTextContent('0 free');
    });

    it('fails on its own with a retry', async () => {
      client.get.mockImplementation((async (path: string) => {
        if (path === '/beds/wards') throw failure();
        if (path === '/beds/available') return [];
        throw new Error(`Unmocked request: ${path}`);
      }) as never);
      renderPage();

      expect(await screen.findByText(/couldn’t load free beds/i)).toBeInTheDocument();
      expect(await screen.findByText('Jide Okafor')).toBeInTheDocument();
    });
  });
});
