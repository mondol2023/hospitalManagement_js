import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { Signpost } from './Signpost';

function Router({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </MemoryRouter>
  );
}

describe('Signpost', () => {
  it('renders one link labelled "Next step" to where the action is done', () => {
    renderWithProviders(
      <Signpost options={[{ to: '/app/front-desk', text: 'Next arrival 10:30 · Amina Yusuf' }]} />
    );

    const link = screen.getByRole('link', { name: /next step.*next arrival 10:30/i });
    expect(link).toHaveAttribute('href', '/app/front-desk');
  });

  it('is absent when nothing qualifies', () => {
    const { container } = renderWithProviders(<Signpost options={[null, undefined, false]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the first option that qualifies, so there is never a second sign', () => {
    renderWithProviders(
      <Signpost
        options={[
          null,
          { to: '/app/emergencies', text: '2 open emergencies' },
          { to: '/app/pharmacy/expiry', text: '4 batches have expired' },
        ]}
      />
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /2 open emergencies/i })).toHaveAttribute(
      'href',
      '/app/emergencies'
    );
  });

  it('swaps to the next sign when the one in front of it stops qualifying', () => {
    const { rerender } = render(<Signpost options={[{ to: '/a', text: 'first sign' }]} />, {
      wrapper: Router,
    });
    expect(screen.getByRole('link', { name: /first sign/i })).toBeInTheDocument();

    rerender(<Signpost options={[{ to: '/b', text: 'second sign' }]} />);
    expect(screen.getByRole('link', { name: /second sign/i })).toHaveAttribute('href', '/b');
  });
});
