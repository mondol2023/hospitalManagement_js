import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducedMotion } from 'framer-motion';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import type * as FramerModule from 'framer-motion';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { renderWithProviders } from '@/test/render';
import type { User } from '@/shared/types/domain';

import { pageOf, vitalsRecord } from '../test-fixtures';
import { CareJourneyPage } from './CareJourneyPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// Reduced motion is read through one hook; the page must work with it on or off.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof FramerModule>()),
  useReducedMotion: vi.fn(() => false),
}));

const client = vi.mocked(api, true);

const JOURNEY = '/medical-records/patient/me';
const NOV = new Date(2026, 10, 3, 10, 0);
const MAY = new Date(2026, 4, 1, 10, 0);
const SEP_2025 = new Date(2025, 8, 14, 10, 0);

const visit = (id: string, at: Date, overrides: Parameters<typeof vitalsRecord>[0] = {}) =>
  vitalsRecord({
    id,
    visitDate: at.toISOString(),
    diagnosis: `Diagnosis ${id}`,
    doctor: { id: 'u-doc', name: 'Dr Rao' } as User,
    vitals: undefined,
    ...overrides,
  });

function serve(pages: Array<ReturnType<typeof pageOf>>) {
  client.page.mockImplementation(async (path: string, config?: { params?: { page?: number } }) => {
    if (path !== JOURNEY) throw new Error(`Unmocked request: ${path}`);
    return pages[(config?.params?.page ?? 1) - 1] ?? pageOf([]);
  });
}

function renderPage(route = '/app/my-health') {
  return renderWithProviders(
    <Routes>
      <Route path="/app/my-health" element={<CareJourneyPage />} />
    </Routes>,
    { route }
  );
}

const eventFor = (id: string) => {
  const node = document.getElementById(`record-${id}`);
  if (!node) throw new Error(`No event for ${id}`);
  return node;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  Element.prototype.scrollIntoView = vi.fn();
  // framer-motion resets the scroll position while it measures a height animation.
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CareJourneyPage', () => {
  it('asks only for the patient’s own history, 20 visits at a time', async () => {
    serve([pageOf([visit('r1', NOV)])]);
    renderPage();

    await screen.findByText('Diagnosis r1');

    expect(client.page).toHaveBeenCalledTimes(1);
    expect(client.page).toHaveBeenCalledWith(JOURNEY, { params: { page: 1, limit: 20 } });
  });

  it('lists visits newest first, with the date, the doctor and what was found', async () => {
    serve([pageOf([visit('r1', NOV), visit('r2', MAY)])]);
    renderPage();

    const list = await screen.findByRole('list', { name: /your visits/i });
    const events = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.id.startsWith('record-'));

    expect(events.map((item) => item.id)).toEqual(['record-r1', 'record-r2']);
    expect(within(events[0]!).getByText(formatDate(NOV))).toBeInTheDocument();
    expect(within(events[0]!).getByText('Dr Rao')).toBeInTheDocument();
    expect(within(events[0]!).getByText('Diagnosis r1')).toBeInTheDocument();
  });

  it('says "Your doctor" when the doctor’s account is gone', async () => {
    serve([pageOf([visit('r1', NOV, { doctor: 'u-gone' })])]);
    renderPage();

    expect(await screen.findByText('Your doctor')).toBeInTheDocument();
  });

  it('puts "You are here" at today, above the past visits', async () => {
    serve([pageOf([visit('r1', NOV)])]);
    renderPage();

    const list = await screen.findByRole('list', { name: /your visits/i });
    const items = within(list).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent(/you are here/i);
    expect(items[0]).toHaveTextContent(/today/i);
    expect(items[1]!.id).toBe('record-r1');
  });

  it('names the year once, where it changes', async () => {
    serve([pageOf([visit('r1', NOV), visit('r2', MAY), visit('r3', SEP_2025)])]);
    renderPage();

    await screen.findByText('Diagnosis r1');

    expect(screen.getAllByText('2025')).toHaveLength(1);
    expect(within(eventFor('r3')).getByText('2025')).toBeInTheDocument();
    expect(screen.queryByText('2026')).not.toBeInTheDocument();
  });

  it('shows the next follow-up above "You are here", as where they go next', async () => {
    const soon = new Date(2026, 10, 28, 0, 0);
    serve([pageOf([visit('r1', NOV, { followUpDate: soon.toISOString() })])]);
    renderPage();

    const next = await screen.findByRole('list', { name: /coming up/i });

    expect(within(next).getByText(/come back on/i)).toBeInTheDocument();
    expect(within(next).getByText(formatDate(soon))).toBeInTheDocument();
  });

  it('leaves out the "coming up" list when nothing is due', async () => {
    serve([pageOf([visit('r1', NOV)])]);
    renderPage();

    await screen.findByText('Diagnosis r1');

    expect(screen.queryByRole('list', { name: /coming up/i })).not.toBeInTheDocument();
  });

  it('carries the emergency strip', async () => {
    serve([pageOf([visit('r1', NOV)])]);
    renderPage();

    await screen.findByText('Diagnosis r1');

    expect(
      screen.getByRole('complementary', { name: /emergency information/i })
    ).toBeInTheDocument();
  });

  describe('details', () => {
    const full = visit('r1', NOV, {
      chiefComplaint: 'A cough that will not go',
      treatmentPlan: 'Rest and fluids',
      notes: 'Review if it gets worse',
      followUpDate: null,
      vitals: { systolicBp: 120, diastolicBp: 80, heartRateBpm: 72 },
      prescriptions: [
        {
          name: 'Amoxicillin',
          dosage: '500 mg',
          frequency: 'Three times a day',
          durationDays: 7,
          instructions: 'Finish the course',
        },
      ],
      attachments: [
        { url: 'https://files.example/chest.png', label: 'Chest X-ray', mimeType: 'image/png' },
        {
          url: 'https://files.example/report.pdf',
          label: 'Lab report',
          mimeType: 'application/pdf',
        },
      ],
    });

    it('keeps them closed until asked, then opens them in the patient’s words', async () => {
      const user = userEvent.setup();
      serve([pageOf([full])]);
      renderPage();

      const toggle = await screen.findByRole('button', { name: /show details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('A cough that will not go')).not.toBeInTheDocument();

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const event = eventFor('r1');
      expect(within(event).getByText('Reason for visit')).toBeInTheDocument();
      expect(within(event).getByText('A cough that will not go')).toBeInTheDocument();
      expect(within(event).getByText('What we found')).toBeInTheDocument();
      expect(within(event).getByText('Plan')).toBeInTheDocument();
      expect(within(event).getByText('Rest and fluids')).toBeInTheDocument();
      expect(within(event).getByText("Doctor's notes")).toBeInTheDocument();
      expect(within(event).getByText('Review if it gets worse')).toBeInTheDocument();
    });

    it('lists medicines with dose, how often, how long and instructions', async () => {
      const user = userEvent.setup();
      serve([pageOf([full])]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show details/i }));

      const event = eventFor('r1');
      expect(within(event).getByText('Amoxicillin')).toBeInTheDocument();
      expect(
        within(event).getByText('500 mg · Three times a day · for 7 days')
      ).toBeInTheDocument();
      expect(within(event).getByText('Finish the course')).toBeInTheDocument();
    });

    it('shows the vitals that were taken, with their units', async () => {
      const user = userEvent.setup();
      serve([pageOf([full])]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show details/i }));

      const event = eventFor('r1');
      expect(within(event).getByText('120/80')).toBeInTheDocument();
      expect(within(event).getByText('Heart rate')).toBeInTheDocument();
      expect(within(event).queryByText('Temperature')).not.toBeInTheDocument();
    });

    it('opens attachments in a new tab, safely, with a thumbnail only for images', async () => {
      const user = userEvent.setup();
      serve([pageOf([full])]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show details/i }));

      const event = eventFor('r1');
      const xray = within(event).getByRole('link', { name: /chest x-ray/i });
      expect(xray).toHaveAttribute('href', 'https://files.example/chest.png');
      expect(xray).toHaveAttribute('target', '_blank');
      expect(xray).toHaveAttribute('rel', 'noopener noreferrer');
      expect(xray.querySelector('img')).not.toBeNull();

      const report = within(event).getByRole('link', { name: /lab report/i });
      expect(report.querySelector('img')).toBeNull();
    });

    it('leaves out the sections a visit has nothing for', async () => {
      const user = userEvent.setup();
      serve([pageOf([visit('r1', NOV)])]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show details/i }));

      const event = eventFor('r1');
      expect(within(event).getByText('What we found')).toBeInTheDocument();
      for (const heading of ['Reason for visit', 'Plan', 'Medicines', 'Vitals', "Doctor's notes"]) {
        expect(within(event).queryByText(heading)).not.toBeInTheDocument();
      }
    });

    it('closes again', async () => {
      const user = userEvent.setup();
      serve([pageOf([full])]);
      renderPage();

      const toggle = await screen.findByRole('button', { name: /show details/i });
      await user.click(toggle);
      await user.click(await screen.findByRole('button', { name: /hide details/i }));

      await waitFor(() =>
        expect(screen.queryByText('A cough that will not go')).not.toBeInTheDocument()
      );
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('earlier visits', () => {
    const firstPage = pageOf([visit('r1', NOV), visit('r2', MAY)], {
      page: 1,
      totalPages: 2,
      total: 3,
    });
    const secondPage = pageOf([visit('r3', SEP_2025)], { page: 2, totalPages: 2, total: 3 });

    it('adds the next batch without remounting the visits already shown', async () => {
      const user = userEvent.setup();
      serve([firstPage, secondPage]);
      renderPage();

      await screen.findByText('Diagnosis r1');
      const before = [eventFor('r1'), eventFor('r2')];

      await user.click(screen.getByRole('button', { name: /show earlier visits/i }));

      expect(await screen.findByText('Diagnosis r3')).toBeInTheDocument();
      expect(eventFor('r1')).toBe(before[0]);
      expect(eventFor('r2')).toBe(before[1]);
      expect(client.page).toHaveBeenLastCalledWith(JOURNEY, { params: { page: 2, limit: 20 } });
    });

    it('goes away once every visit is shown, and never asks for a page that is not there', async () => {
      const user = userEvent.setup();
      serve([firstPage, secondPage]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show earlier visits/i }));
      await screen.findByText('Diagnosis r3');

      expect(
        screen.queryByRole('button', { name: /show earlier visits/i })
      ).not.toBeInTheDocument();
      expect(client.page).toHaveBeenCalledTimes(2);
    });

    it('is not offered when everything fits on the first page', async () => {
      serve([pageOf([visit('r1', NOV)])]);
      renderPage();

      await screen.findByText('Diagnosis r1');

      expect(
        screen.queryByRole('button', { name: /show earlier visits/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('a link to one visit', () => {
    it('opens that visit and scrolls to it', async () => {
      serve([pageOf([visit('r1', NOV), visit('r2', MAY, { chiefComplaint: 'Sore throat' })])]);
      renderPage('/app/my-health#record-r2');

      expect(await screen.findByText('Sore throat')).toBeInTheDocument();
      await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
      expect(within(eventFor('r2')).getByRole('button', { name: /hide details/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(within(eventFor('r1')).getByRole('button', { name: /show details/i })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('still opens the visit when the patient asks for reduced motion', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      serve([pageOf([visit('r1', NOV, { chiefComplaint: 'Sore throat' })])]);
      renderPage('/app/my-health#record-r1');

      expect(await screen.findByText('Sore throat')).toBeInTheDocument();
    });

    it('does nothing for a visit that is not in the list', async () => {
      serve([pageOf([visit('r1', NOV)])]);
      renderPage('/app/my-health#record-nope');

      await screen.findByText('Diagnosis r1');

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /show details/i })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });
  });

  describe('the route line', () => {
    it('is drawn in full when the patient asks for reduced motion', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      serve([pageOf([visit('r1', NOV)])]);
      renderPage();

      await screen.findByText('Diagnosis r1');

      const line = screen.getByTestId('route-line');
      expect(line).toHaveAttribute('aria-hidden', 'true');
      expect(line.style.transform).toMatch(/scaleY\(1\)|none/);
    });
  });

  describe('before the first visit', () => {
    it('shows only "You are here" and a ring for the first visit', async () => {
      serve([pageOf([])]);
      renderPage();

      expect(
        await screen.findByText(/your care journey starts at your first visit/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/you are here/i)).toBeInTheDocument();
      expect(screen.getByText('Your first visit')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /book an appointment/i })).toHaveAttribute(
        'href',
        '/app/appointments'
      );
      expect(
        screen.queryByRole('button', { name: /show earlier visits/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('when it cannot load', () => {
    it('says so and tries again on request', async () => {
      const user = userEvent.setup();
      client.page.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
      client.page.mockResolvedValueOnce(pageOf([visit('r1', NOV)]));
      renderPage();

      await screen.findByText(/couldn't load your care journey/i);
      await user.click(screen.getByRole('button', { name: /try again/i }));

      expect(await screen.findByText('Diagnosis r1')).toBeInTheDocument();
      // The emergency strip is part of the page, not of the data.
      expect(
        screen.getByRole('complementary', { name: /emergency information/i })
      ).toBeInTheDocument();
    });

    it('sends a patient with no record to the front desk', async () => {
      client.page.mockRejectedValue(new ApiError('NOT_FOUND', 'Patient not found', 404));
      renderPage();

      expect(
        await screen.findByText(
          /we couldn't find your patient record\. please contact the front desk/i
        )
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });

    it('shows a loading state first', () => {
      client.page.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(
        screen.getByRole('status', { name: /loading your care journey/i })
      ).toBeInTheDocument();
    });
  });
});
