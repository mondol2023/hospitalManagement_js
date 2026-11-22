import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { FACILITIES, FALLBACK, HOSPITAL, TESTIMONIALS, TESTIMONIALS_ARE_SAMPLES } from '@/content/hospital';
import { useAuthStore } from '@/features/auth';

import { HomePage } from './HomePage';

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

describe('HomePage: facilities, patient feedback and where to find us', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
  });

  it('lists every facility from the content file under a Facilities heading', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'Facilities' });
    expect(FACILITIES.length).toBeGreaterThan(0);
    for (const facility of FACILITIES) {
      expect(within(section).getByText(facility.name)).toBeInTheDocument();
      expect(within(section).getByText(facility.detail)).toBeInTheDocument();
    }
  });

  it('shows each piece of patient feedback with who said it', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'What patients say' });
    expect(TESTIMONIALS.length).toBeGreaterThan(0);
    for (const item of TESTIMONIALS) {
      expect(within(section).getByText(item.quote)).toBeInTheDocument();
      expect(within(section).getByText(item.attribution)).toBeInTheDocument();
    }
  });

  it('says on the page that the feedback is sample text while it still is', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'What patients say' });
    const notice = within(section).queryByRole('note');
    if (TESTIMONIALS_ARE_SAMPLES) {
      expect(notice).toHaveTextContent(/sample/i);
    } else {
      expect(notice).toBeNull();
    }
  });

  it('gives the honest "not published yet" address until the hospital supplies one, and no maps link', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'Find us' });
    if (HOSPITAL.address === null) {
      expect(within(section).getByText(FALLBACK.address)).toBeInTheDocument();
      expect(within(section).queryByRole('link', { name: /open in maps/i })).toBeNull();
    }
  });

  it('draws a schematic map that says it is illustrative, so it is never mistaken for directions', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'Find us' });
    expect(within(section).getByRole('img', { name: /schematic map/i })).toBeInTheDocument();
    expect(within(section).getByText(/not to scale/i)).toBeInTheDocument();
  });

  it('sends visitors on to the visit page, the contact page and the emergency page', () => {
    renderHome();

    const section = screen.getByRole('region', { name: 'Find us' });
    expect(within(section).getByRole('link', { name: /plan your visit/i })).toHaveAttribute('href', '/visit');
    expect(within(section).getByRole('link', { name: /contact the front desk/i })).toHaveAttribute('href', '/contact');
  });
});
