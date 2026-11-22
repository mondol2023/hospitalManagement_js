import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import type * as UiModule from '@/shared/ui';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import {
  appointment,
  bill,
  careTeam,
  myPatient,
  pageOf,
  routes,
  vitalsRecord,
} from '../test-fixtures';
import { PatientDashboard } from './PatientDashboard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof UiModule>()),
  toast: { error: vi.fn(), success: vi.fn() },
}));

const client = vi.mocked(api, true);

const ME = '/patients/me';
const TEAM = '/patients/me/care-team';
const LATEST = '/medical-records/patient/me/latest';
const APPOINTMENTS = '/appointments';
const BILLS = '/bills/patient/me';
const JOURNEY = '/medical-records/patient/me';

interface Setup {
  patient?: unknown;
  team?: unknown;
  latest?: unknown;
  upcoming?: unknown;
  bills?: unknown;
  journey?: unknown;
}

function setup({
  patient = myPatient(),
  team = careTeam(),
  latest = vitalsRecord(),
  upcoming = pageOf([appointment('a1')]),
  bills = pageOf([]),
  journey = pageOf([]),
}: Setup = {}) {
  client.get.mockImplementation(routes({ [ME]: patient, [TEAM]: team, [LATEST]: latest }));
  client.page.mockImplementation(
    routes({ [APPOINTMENTS]: upcoming, [BILLS]: bills, [JOURNEY]: journey })
  );
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderDashboard() {
  return renderWithProviders(
    <Routes>
      <Route path="/app" element={<PatientDashboard name="Amina Yusuf" />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route: '/app' }
  );
}

const card = (name: RegExp) => screen.findByRole('region', { name });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 22, 9, 0) });
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PatientDashboard', () => {
  describe('greeting', () => {
    it('greets the patient by first name for the time of day', () => {
      renderDashboard();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Good morning, Amina' })
      ).toBeInTheDocument();
    });

    it('says where the patient is staying when admitted', async () => {
      setup({
        patient: myPatient({
          isAdmitted: true,
          ward: 'Cardiology',
          bed: { id: 'b1', bedNumber: '12' } as never,
        }),
      });
      renderDashboard();

      expect(
        await screen.findByText("You're staying with us in Cardiology, bed 12")
      ).toBeInTheDocument();
    });

    it('mentions the next visit when not admitted', async () => {
      renderDashboard();

      expect(await screen.findByText('Your next visit is in 2 days')).toBeInTheDocument();
    });

    it('says nothing extra when not admitted and nothing is booked', async () => {
      setup({ upcoming: pageOf([]) });
      renderDashboard();

      await screen.findByText(/nothing booked yet/i);
      expect(screen.queryByText(/your next visit is/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/staying with us/i)).not.toBeInTheDocument();
    });
  });

  describe('your care route', () => {
    it('shows when, who and why, in the patient’s words', async () => {
      renderDashboard();

      const panel = await card(/your care route/i);
      expect(await within(panel).findByText('Dr Imani Khan')).toBeInTheDocument();
      expect(within(panel).getByText('Blood pressure review')).toBeInTheDocument();
      expect(within(panel).getByText('Confirmed')).toBeInTheDocument();
      expect(within(panel).getByText(/Nov 24, 2026|24 Nov 2026/)).toBeInTheDocument();
      // Hour and minute, never seconds.
      expect(within(panel).getByText(/10:30/)).toBeInTheDocument();
    });

    it('asks the server for upcoming visits', async () => {
      renderDashboard();
      await card(/your care route/i);

      await waitFor(() =>
        expect(client.page).toHaveBeenCalledWith(APPOINTMENTS, {
          params: { upcoming: true, limit: 3 },
        })
      );
    });

    it('calls a pending visit "Waiting for confirmation"', async () => {
      setup({ upcoming: pageOf([appointment('a1', { status: 'pending' })]) });
      renderDashboard();

      expect(await screen.findByText('Waiting for confirmation')).toBeInTheDocument();
    });

    it('counts the other booked visits', async () => {
      setup({ upcoming: pageOf([appointment('a1')], { total: 3 }) });
      renderDashboard();

      expect(await screen.findByText('+2 more booked')).toBeInTheDocument();
    });

    it('links to all appointments', async () => {
      renderDashboard();

      const panel = await card(/your care route/i);
      expect(
        await within(panel).findByRole('link', { name: /view appointments/i })
      ).toHaveAttribute('href', '/app/appointments');
    });

    it('names an unpopulated doctor as "Your doctor", not an id', async () => {
      setup({ upcoming: pageOf([appointment('a1', { doctor: 'u-gone' })]) });
      renderDashboard();

      const panel = await card(/your care route/i);
      expect(await within(panel).findByText('Your doctor')).toBeInTheDocument();
      expect(within(panel).queryByText('u-gone')).not.toBeInTheDocument();
    });

    it('is the first panel on the page, ahead of the cards', async () => {
      renderDashboard();

      const regions = await screen.findAllByRole('region');

      expect(regions[0]).toHaveAccessibleName(/your care route/i);
    });

    it('shows the last visit behind the patient', async () => {
      setup({
        journey: pageOf([
          vitalsRecord({ id: 'r1', visitDate: new Date(2026, 10, 3, 10, 0).toISOString() }),
        ]),
      });
      renderDashboard();

      const panel = await card(/your care route/i);
      expect(await within(panel).findByText(/last visit/i)).toBeInTheDocument();
      expect(within(panel).getByRole('link', { name: /nov 3, 2026|3 nov 2026/i })).toHaveAttribute(
        'href',
        '/app/my-health#record-r1'
      );
    });

    it('invites a booking when nothing is booked', async () => {
      setup({ upcoming: pageOf([]) });
      renderDashboard();

      expect(await screen.findByText('Nothing booked yet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /book an appointment/i })).toHaveAttribute(
        'href',
        '/app/appointments'
      );
    });
  });

  describe('latest vitals', () => {
    it('shows the date, the doctor and each reading with its unit', async () => {
      renderDashboard();

      const panel = await card(/latest vitals/i);
      expect(await within(panel).findByText('152/96')).toBeInTheDocument();
      expect(within(panel).getByText('Blood pressure')).toBeInTheDocument();
      expect(within(panel).getByText('mmHg')).toBeInTheDocument();
      expect(within(panel).getByText('78')).toBeInTheDocument();
      expect(within(panel).getByText('bpm')).toBeInTheDocument();
      expect(within(panel).getByText(/Dr Imani Khan/)).toBeInTheDocument();
      expect(within(panel).getByText(/Nov 18, 2026|18 Nov 2026/)).toBeInTheDocument();
    });

    it('never says whether a reading is normal', async () => {
      renderDashboard();

      const panel = await card(/latest vitals/i);
      await within(panel).findByText('152/96');
      expect(
        within(panel).queryByText(/normal|high|low|abnormal|elevated/i)
      ).not.toBeInTheDocument();
    });

    it('lists only the readings that exist', async () => {
      setup({ latest: vitalsRecord({ vitals: { temperatureC: 36.8 } }) });
      renderDashboard();

      const panel = await card(/latest vitals/i);
      expect(await within(panel).findByText('36.8')).toBeInTheDocument();
      expect(within(panel).queryByText('Blood pressure')).not.toBeInTheDocument();
      expect(within(panel).queryByText('—')).not.toBeInTheDocument();
    });

    it('asks for the latest record that has vitals, through the me route', async () => {
      renderDashboard();
      await card(/latest vitals/i);

      await waitFor(() =>
        expect(client.get).toHaveBeenCalledWith(LATEST, { params: { withVitals: true } })
      );
    });

    it('links to the care journey', async () => {
      renderDashboard();

      const panel = await card(/latest vitals/i);
      expect(
        await within(panel).findByRole('link', { name: /see your care journey/i })
      ).toHaveAttribute('href', '/app/my-health');
    });

    it('explains an empty card', async () => {
      setup({ latest: null });
      renderDashboard();

      expect(
        await screen.findByText(
          /no vitals recorded yet\. they'll appear here after your next visit\./i
        )
      ).toBeInTheDocument();
    });
  });

  describe('my care team', () => {
    it('shows the doctor and the nurses by name', async () => {
      renderDashboard();

      const panel = await card(/my care team/i);
      expect(await within(panel).findByText('Dr Imani Khan')).toBeInTheDocument();
      expect(within(panel).getByText('Bea Arthur')).toBeInTheDocument();
      expect(within(panel).getByText('Cy Young')).toBeInTheDocument();
    });

    it('shows at most three nurses and says how many more there are', async () => {
      setup({
        team: careTeam({
          nurses: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
            id: `u-${letter}`,
            name: `Nurse ${letter}`,
          })),
        }),
      });
      renderDashboard();

      const panel = await card(/my care team/i);
      expect(await within(panel).findByText('Nurse C')).toBeInTheDocument();
      expect(within(panel).queryByText('Nurse D')).not.toBeInTheDocument();
      expect(within(panel).getByText('+2 more')).toBeInTheDocument();
    });

    it('has no button, and says why, when no team is assigned', async () => {
      setup({ team: careTeam({ primaryDoctor: null, nurses: [] }) });
      renderDashboard();

      expect(
        await screen.findByText("Your care team hasn't been assigned yet.")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /message my care team/i })
      ).not.toBeInTheDocument();
    });

    it('opens the thread with the real patient id and goes to it', async () => {
      client.post.mockResolvedValue({ id: 'conv-9' });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /message my care team/i }));

      await waitFor(() => expect(client.post).toHaveBeenCalledWith('/chat/care-team/p-amina', {}));
      expect(await screen.findByTestId('where')).toHaveTextContent('/app/messages?c=conv-9');
    });

    it('opens one thread however many times it is clicked', async () => {
      client.post.mockReturnValue(new Promise(() => {}));
      renderDashboard();

      const button = await screen.findByRole('button', { name: /message my care team/i });
      await userEvent.click(button);
      await userEvent.click(button);

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
    });

    it('explains NO_CARE_TEAM in place', async () => {
      client.post.mockRejectedValue(new ApiError('NO_CARE_TEAM', 'none', 400));
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /message my care team/i }));

      expect(
        await screen.findByText(/your care team hasn't been assigned yet\. the ward will add them/i)
      ).toBeInTheDocument();
    });

    it('cannot message before the patient record has loaded', async () => {
      client.get.mockImplementation(
        routes({
          [ME]: () => new Promise(() => {}),
          [TEAM]: careTeam(),
          [LATEST]: null,
        })
      );
      renderDashboard();

      expect(await screen.findByRole('button', { name: /message my care team/i })).toBeDisabled();
    });
  });

  describe('bills', () => {
    it('shows what is owed and across how many bills', async () => {
      setup({ bills: pageOf([bill('1', 10_000, 2_500), bill('2', 5_000, 0)]) });
      renderDashboard();

      const panel = await card(/bills/i);
      expect(await within(panel).findByText('$125.00')).toBeInTheDocument();
      expect(within(panel).getByText(/2 open bills/i)).toBeInTheDocument();
      expect(within(panel).getByRole('link', { name: /see your bills/i })).toHaveAttribute(
        'href',
        '/app/billing'
      );
    });

    it('asks only for open bills, from the patient route — never /bills', async () => {
      renderDashboard();
      await card(/bills/i);

      await waitFor(() =>
        expect(client.page).toHaveBeenCalledWith(BILLS, { params: { open: true, limit: 50 } })
      );
      expect(client.page.mock.calls.map(([path]) => path)).not.toContain('/bills');
    });

    it('says so when everything is paid', async () => {
      renderDashboard();

      expect(await screen.findByText("You're all paid up.")).toBeInTheDocument();
    });

    it('never paints an amount red', async () => {
      setup({ bills: pageOf([bill('1', 10_000, 0)]) });
      renderDashboard();

      const panel = await card(/bills/i);
      const amount = await within(panel).findByText('$100.00');
      expect(amount.className).not.toMatch(/danger|red/);
    });
  });

  it('keeps the emergency notice, unchanged', () => {
    renderDashboard();

    expect(screen.getByText('In an emergency')).toBeInTheDocument();
    expect(
      screen.getByText(
        /do not use this app to report an emergency\. call your local emergency number, or go to the nearest emergency department\./i
      )
    ).toBeInTheDocument();
  });

  describe('when one card fails', () => {
    it('keeps the others, and retries only itself', async () => {
      client.get.mockImplementation(
        routes({
          [ME]: myPatient(),
          [TEAM]: careTeam(),
          [LATEST]: () => {
            throw failure();
          },
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn't load your vitals/i)).toBeInTheDocument();
      expect(await screen.findByText('Bea Arthur')).toBeInTheDocument();
      expect(screen.getByText('Blood pressure review')).toBeInTheDocument();

      setup();
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(await screen.findByText('152/96')).toBeInTheDocument();
    });

    it('does the same for the appointment card', async () => {
      client.page.mockImplementation(
        routes({
          [APPOINTMENTS]: () => {
            throw failure();
          },
          [BILLS]: pageOf([]),
          [JOURNEY]: pageOf([]),
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn't load your appointments/i)).toBeInTheDocument();
      expect(await screen.findByText('152/96')).toBeInTheDocument();
    });

    it('does the same for the bills card', async () => {
      client.page.mockImplementation(
        routes({
          [APPOINTMENTS]: pageOf([appointment('a1')]),
          [JOURNEY]: pageOf([]),
          [BILLS]: () => {
            throw failure();
          },
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn't load your bills/i)).toBeInTheDocument();
      expect(await screen.findByText('Blood pressure review')).toBeInTheDocument();
    });

    it('does the same for the care team card', async () => {
      client.get.mockImplementation(
        routes({
          [ME]: myPatient(),
          [TEAM]: () => {
            throw failure();
          },
          [LATEST]: vitalsRecord(),
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn't load your care team/i)).toBeInTheDocument();
      expect(await screen.findByText('152/96')).toBeInTheDocument();
    });
  });

  it('shows a skeleton in each card while it loads', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(
      screen.getByRole('status', { name: /loading your care route/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading your vitals/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading your care team/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading your bills/i })).toBeInTheDocument();
  });
});
