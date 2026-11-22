import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducedMotion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';
import type { User } from '@/shared/types/domain';
import type * as FramerModule from 'framer-motion';

import { appointment, myPatient, pageOf, routes, vitalsRecord } from '../test-fixtures';
import { resetRouteDrawn, RouteStrip } from './RouteStrip';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// Reduced motion is read through one hook; the strip must work with it on or off.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof FramerModule>()),
  useReducedMotion: vi.fn(() => false),
}));

const client = vi.mocked(api, true);

const ME = '/patients/me';
const APPOINTMENTS = '/appointments';
const JOURNEY = '/medical-records/patient/me';

const lastVisit = (overrides: Parameters<typeof vitalsRecord>[0] = {}) =>
  vitalsRecord({
    id: 'r1',
    visitDate: new Date(2026, 10, 3, 10, 0).toISOString(),
    doctor: { id: 'u-doc', name: 'Dr Rao' } as User,
    ...overrides,
  });

interface Setup {
  patient?: unknown;
  upcoming?: unknown;
  journey?: unknown;
}

function setup({
  patient = myPatient(),
  upcoming = pageOf([appointment('a1')]),
  journey = pageOf([lastVisit()]),
}: Setup = {}) {
  client.get.mockImplementation(routes({ [ME]: patient }));
  client.page.mockImplementation(routes({ [APPOINTMENTS]: upcoming, [JOURNEY]: journey }));
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

const renderStrip = () => renderWithProviders(<RouteStrip />, { route: '/app' });

/** The stops, in the order a screen reader reads them. */
async function stops() {
  const route = await screen.findByRole('region', { name: /your care route/i });
  const list = await within(route).findByRole('list');
  // Typed as three so a test can say `items[1]`; the ones that expect two assert the length.
  const items = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement, HTMLElement];
  return { route, list, items };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  resetRouteDrawn();
  setup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouteStrip', () => {
  describe('the stops', () => {
    it('reads as an ordered list: last visit, you are here, next visit', async () => {
      renderStrip();

      const { list, items } = await stops();

      expect(list.tagName).toBe('OL');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent(/last visit/i);
      expect(items[1]).toHaveTextContent(/you are here/i);
      expect(items[2]).toHaveTextContent(/next visit/i);
    });

    it('says who saw the patient last, and links to that visit in the care journey', async () => {
      renderStrip();

      const { items } = await stops();

      expect(within(items[0]).getByText('Dr Rao')).toBeInTheDocument();
      expect(within(items[0]).getByRole('link')).toHaveAttribute(
        'href',
        '/app/my-health#record-r1'
      );
    });

    it('asks for the first page of the journey, the same request My health makes', async () => {
      renderStrip();
      await stops();

      expect(client.page).toHaveBeenCalledWith(JOURNEY, { params: { page: 1, limit: 20 } });
    });

    it('drops "Last visit" when there are no records, so the line starts at "You are here"', async () => {
      setup({ journey: pageOf([]) });
      renderStrip();

      const { items } = await stops();

      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent(/you are here/i);
      expect(items[1]).toHaveTextContent(/next visit/i);
      expect(screen.queryByText(/last visit/i)).not.toBeInTheDocument();
    });

    it('names an unpopulated doctor as "Your doctor", not an id', async () => {
      setup({ journey: pageOf([lastVisit({ doctor: 'u-gone' })]) });
      renderStrip();

      const { items } = await stops();

      expect(within(items[0]).getByText('Your doctor')).toBeInTheDocument();
      expect(within(items[0]).queryByText('u-gone')).not.toBeInTheDocument();
    });
  });

  describe('you are here', () => {
    it('says "Today"', async () => {
      renderStrip();

      const { items } = await stops();

      expect(within(items[1]).getByText('Today')).toBeInTheDocument();
    });

    it('adds the ward and bed under "Today" when the patient is admitted', async () => {
      setup({
        patient: myPatient({
          isAdmitted: true,
          ward: 'Cardiology',
          bed: { id: 'b1', bedNumber: '12' } as never,
        }),
      });
      renderStrip();

      const { items } = await stops();

      expect(await within(items[1]).findByText('Ward Cardiology, bed 12')).toBeInTheDocument();
    });

    it('stops at the ward when the bed arrived as a bare id', async () => {
      setup({ patient: myPatient({ isAdmitted: true, ward: 'Cardiology', bed: 'b-1' }) });
      renderStrip();

      const { items } = await stops();

      expect(await within(items[1]).findByText('Ward Cardiology')).toBeInTheDocument();
      expect(within(items[1]).queryByText(/b-1/)).not.toBeInTheDocument();
    });

    it('adds nothing when the patient is not admitted', async () => {
      renderStrip();

      const { items } = await stops();

      expect(within(items[1]).queryByText(/ward/i)).not.toBeInTheDocument();
    });
  });

  describe('next visit', () => {
    it('shows when, who, why and where it stands, in the patient’s words', async () => {
      renderStrip();

      const { items } = await stops();
      const next = items.at(-1)!;

      expect(within(next).getByText('Dr Imani Khan')).toBeInTheDocument();
      expect(within(next).getByText('Blood pressure review')).toBeInTheDocument();
      expect(within(next).getByText('Confirmed')).toBeInTheDocument();
      expect(within(next).getByText(/Nov 24, 2026|24 Nov 2026/)).toBeInTheDocument();
      // Hour and minute, never seconds.
      expect(within(next).getByText(/10:30/)).toBeInTheDocument();
    });

    it('calls a pending visit "Waiting for confirmation"', async () => {
      setup({ upcoming: pageOf([appointment('a1', { status: 'pending' })]) });
      renderStrip();

      expect(await screen.findByText('Waiting for confirmation')).toBeInTheDocument();
    });

    it('asks the server for upcoming visits', async () => {
      renderStrip();
      await stops();

      await waitFor(() =>
        expect(client.page).toHaveBeenCalledWith(APPOINTMENTS, {
          params: { upcoming: true, limit: 3 },
        })
      );
    });

    it('counts the other booked visits', async () => {
      setup({ upcoming: pageOf([appointment('a1')], { total: 3 }) });
      renderStrip();

      expect(await screen.findByText('+2 more booked')).toBeInTheDocument();
    });

    it('links to all appointments', async () => {
      renderStrip();

      const { items } = await stops();

      expect(within(items.at(-1)!).getByRole('link', { name: /view appointments/i })).toHaveAttribute(
        'href',
        '/app/appointments'
      );
    });

    it('says nothing is booked, and offers the one primary action', async () => {
      setup({ upcoming: pageOf([]) });
      renderStrip();

      const { items } = await stops();
      const next = items.at(-1)!;

      expect(within(next).getByText('Nothing booked yet')).toBeInTheDocument();
      expect(within(next).getByRole('link', { name: /book an appointment/i })).toHaveAttribute(
        'href',
        '/app/appointments'
      );
    });

    it('does not offer to book when a visit is already booked', async () => {
      renderStrip();
      await stops();

      expect(screen.queryByRole('link', { name: /book an appointment/i })).not.toBeInTheDocument();
    });
  });

  describe('when one half fails', () => {
    it('shows the error for the next visit and keeps the last visit', async () => {
      client.page.mockImplementation(
        routes({
          [APPOINTMENTS]: () => {
            throw failure();
          },
          [JOURNEY]: pageOf([lastVisit()]),
        })
      );
      renderStrip();

      expect(await screen.findByText(/couldn't load your appointments/i)).toBeInTheDocument();
      expect(screen.getByText('Dr Rao')).toBeInTheDocument();
      expect(screen.getByText(/you are here/i)).toBeInTheDocument();
    });

    it('shows the error for the last visit and keeps the next visit', async () => {
      client.page.mockImplementation(
        routes({
          [APPOINTMENTS]: pageOf([appointment('a1')]),
          [JOURNEY]: () => {
            throw failure();
          },
        })
      );
      renderStrip();

      expect(await screen.findByText(/couldn't load your visits/i)).toBeInTheDocument();
      expect(screen.getByText('Blood pressure review')).toBeInTheDocument();
      expect(screen.getByText(/you are here/i)).toBeInTheDocument();
    });

    it('retries only the half that failed', async () => {
      client.page.mockImplementation(
        routes({
          [APPOINTMENTS]: () => {
            throw failure();
          },
          [JOURNEY]: pageOf([lastVisit()]),
        })
      );
      renderStrip();
      await screen.findByText(/couldn't load your appointments/i);
      const journeyCalls = client.page.mock.calls.filter(([path]) => path === JOURNEY).length;

      setup();
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(await screen.findByText('Blood pressure review')).toBeInTheDocument();
      expect(client.page.mock.calls.filter(([path]) => path === JOURNEY)).toHaveLength(
        journeyCalls
      );
    });
  });

  it('shows one skeleton while the route loads', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));
    renderStrip();

    expect(screen.getByRole('status', { name: /loading your care route/i })).toBeInTheDocument();
  });

  describe('motion', () => {
    // The route draws once, when the patient first sees it: it explains "where you
    // are and where you go next", which is news the first time and noise the tenth.
    // The list carries `data-motion` so the rule is testable without a clock.
    const motionOf = (list: HTMLElement) => list.dataset.motion;

    it('draws the first time it is shown in a session', async () => {
      renderStrip();

      const { list } = await stops();

      expect(motionOf(list)).toBe('draw');
    });

    it('does not draw again when the patient comes back to the dashboard', async () => {
      const first = renderStrip();
      await stops();
      first.unmount();

      renderStrip();
      const { list } = await stops();

      expect(motionOf(list)).toBe('still');
    });

    it('is drawn complete from the start when the patient asks for reduced motion', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      renderStrip();

      const { list } = await stops();

      expect(motionOf(list)).toBe('still');
    });

    it('keeps every word readable whether or not it draws', async () => {
      renderStrip();

      const { items } = await stops();

      // Motion fades labels in; it must never remove them from the page.
      expect(items[0]).toHaveTextContent('Dr Rao');
      expect(items[1]).toHaveTextContent('Today');
      expect(items[2]).toHaveTextContent('Dr Imani Khan');
    });

    it('hides the drawing from assistive technology, and leaves the list to speak', async () => {
      const { container } = renderStrip();
      await stops();

      const drawings = container.querySelectorAll('svg');
      expect(drawings.length).toBeGreaterThan(0);
      for (const drawing of drawings) expect(drawing).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
