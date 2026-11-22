import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import type * as UiModule from '@/shared/ui';
import { toast } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { careTeam, myPatient, routes } from '../test-fixtures';
import { CareTeamPage } from './CareTeamPage';

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

function setup({ patient = myPatient(), team = careTeam() }: { patient?: unknown; team?: unknown } = {}) {
  client.get.mockImplementation(routes({ [ME]: patient, [TEAM]: team }));
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/app/my-care-team" element={<CareTeamPage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route: '/app/my-care-team' }
  );
}

const messageButton = () => screen.findByRole('button', { name: /message my care team/i });

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe('CareTeamPage', () => {
  it('titles the page', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: /^my care team$/i })
    ).toBeInTheDocument();
  });

  describe('the doctor', () => {
    it('shows the name, specialization and department under "Your doctor"', async () => {
      renderPage();

      const panel = await screen.findByRole('region', { name: /your doctor/i });
      expect(within(panel).getByText('Dr Imani Khan')).toBeInTheDocument();
      expect(within(panel).getByText('Cardiology')).toBeInTheDocument();
      expect(within(panel).getByText('Heart centre')).toBeInTheDocument();
    });

    it('shows the photo when there is one, initials when there is not', async () => {
      setup({
        team: careTeam({
          primaryDoctor: { id: 'u-doc', name: 'Dr Imani Khan', profilePic: '/img/imani.jpg' },
        }),
      });
      const { container } = renderPage();

      await screen.findByText('Dr Imani Khan');
      expect(container.querySelector('img[src="/img/imani.jpg"]')).not.toBeNull();
    });

    it('falls back to initials without a photo', async () => {
      renderPage();

      const panel = await screen.findByRole('region', { name: /your doctor/i });
      expect(within(panel).getByText('DI')).toBeInTheDocument();
    });

    it('leaves the doctor panel out when none is assigned yet', async () => {
      setup({ team: careTeam({ primaryDoctor: null }) });
      renderPage();

      await screen.findByText('Bea Arthur');
      expect(screen.queryByRole('region', { name: /your doctor/i })).not.toBeInTheDocument();
    });
  });

  describe('the nurses', () => {
    it('lists each nurse under "Nurses looking after you"', async () => {
      renderPage();

      const section = await screen.findByRole('region', { name: /nurses looking after you/i });
      const items = within(section).getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual([
        expect.stringContaining('Bea Arthur'),
        expect.stringContaining('Cy Young'),
      ]);
    });

    it('hides the section, rather than showing it empty, when there are no nurses', async () => {
      setup({ team: careTeam({ nurses: [] }) });
      renderPage();

      await screen.findByText('Dr Imani Khan');
      expect(
        screen.queryByRole('region', { name: /nurses looking after you/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/nurses looking after you/i)).not.toBeInTheDocument();
    });

    it('says the ward will add nurses when the patient is admitted and has none yet', async () => {
      setup({ patient: myPatient({ isAdmitted: true, ward: 'Cardiology' }), team: careTeam({ nurses: [] }) });
      renderPage();

      const section = await screen.findByRole('region', { name: /nurses looking after you/i });
      expect(within(section).getByText(/the ward will add your nurses/i)).toBeInTheDocument();
    });
  });

  describe('privacy', () => {
    it('never prints a staff email or phone number', async () => {
      const { container } = renderPage();

      await screen.findByText('Dr Imani Khan');
      expect(container.textContent).not.toMatch(/@/);
      expect(container.querySelector('a[href^="tel:"]:not([aria-label])')).toBeNull();
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    });
  });

  describe('messaging the team', () => {
    it('opens the thread with the real patient id and goes to it', async () => {
      client.post.mockResolvedValue({ id: 'conv-9' });
      renderPage();

      await userEvent.click(await messageButton());

      await waitFor(() => expect(client.post).toHaveBeenCalledWith('/chat/care-team/p-amina', {}));
      expect(await screen.findByTestId('where')).toHaveTextContent('/app/messages?c=conv-9');
    });

    it('is busy while it works, and a second click opens no second thread', async () => {
      client.post.mockReturnValue(new Promise(() => {}));
      renderPage();

      const button = await messageButton();
      await userEvent.click(button);
      await userEvent.click(button);

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
    });

    it('cannot be pressed before the patient record has loaded', async () => {
      client.get.mockImplementation(routes({ [ME]: () => new Promise(() => {}), [TEAM]: careTeam() }));
      renderPage();

      expect(await messageButton()).toBeDisabled();
    });

    it('explains NO_CARE_TEAM in place, without a toast', async () => {
      client.post.mockRejectedValue(new ApiError('NO_CARE_TEAM', 'none', 400));
      renderPage();

      await userEvent.click(await messageButton());

      expect(
        await screen.findByText(
          /your care team hasn't been assigned yet\. the ward will add them when your care starts\./i
        )
      ).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('toasts any other failure and stays on the page', async () => {
      client.post.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
      renderPage();

      await userEvent.click(await messageButton());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Couldn't open the conversation. Try again in a moment."
        )
      );
      expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    });
  });

  it('says when messages are read and what to do when it is urgent', async () => {
    renderPage();

    expect(
      await screen.findByText(
        /for anything urgent, call the ward or your local emergency number\. messages are read during working hours\./i
      )
    ).toBeInTheDocument();
  });

  it('carries the emergency strip', async () => {
    renderPage();

    expect(await screen.findByRole('complementary', { name: /emergency information/i })).toBeInTheDocument();
  });

  describe('states', () => {
    it('shows a loading status while the team loads', () => {
      client.get.mockImplementation(routes({ [ME]: myPatient(), [TEAM]: () => new Promise(() => {}) }));
      renderPage();

      expect(screen.getByRole('status', { name: /loading your care team/i })).toBeInTheDocument();
    });

    it('explains an empty team and offers no message button', async () => {
      setup({ team: careTeam({ primaryDoctor: null, nurses: [] }) });
      renderPage();

      expect(await screen.findByText("Your care team hasn't been assigned yet.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /message my care team/i })).not.toBeInTheDocument();
    });

    it('offers a retry when the team fails to load', async () => {
      client.get.mockImplementation(
        routes({
          [ME]: myPatient(),
          [TEAM]: () => {
            throw new ApiError('INTERNAL_ERROR', 'boom', 500);
          },
        })
      );
      renderPage();

      expect(await screen.findByText(/couldn't load your care team/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('sends a patient with no patient record to the front desk', async () => {
      client.get.mockImplementation(
        routes({
          [ME]: () => {
            throw new ApiError('NOT_FOUND', 'none', 404);
          },
          [TEAM]: () => {
            throw new ApiError('NOT_FOUND', 'none', 404);
          },
        })
      );
      renderPage();

      expect(
        await screen.findByText(/we couldn't find your patient record\. please contact the front desk\./i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /message my care team/i })).not.toBeInTheDocument();
    });
  });
});
