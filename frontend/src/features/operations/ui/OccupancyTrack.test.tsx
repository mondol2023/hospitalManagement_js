import { render, screen, within } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WardOccupancyRow } from '@/features/dashboard';
import type * as FramerModule from 'framer-motion';

import { OccupancyTrack } from './OccupancyTrack';

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof FramerModule>()),
  useReducedMotion: vi.fn(() => false),
}));

const WARD_A: WardOccupancyRow = {
  ward: 'Ward A',
  total: 20,
  occupied: 17,
  available: 1,
  byStatus: { occupied: 17, cleaning: 1, maintenance: 1, available: 1 },
  occupancyRate: 85,
};

const FULL: WardOccupancyRow = {
  ward: 'Ward B',
  total: 20,
  occupied: 20,
  available: 0,
  byStatus: { occupied: 20 },
  occupancyRate: 100,
};

function renderTrack(ward: WardOccupancyRow, draw?: boolean) {
  return render(
    <ul>
      <OccupancyTrack ward={ward} draw={draw} />
    </ul>
  );
}

beforeEach(() => vi.mocked(useReducedMotion).mockReturnValue(false));

describe('OccupancyTrack', () => {
  it('is a list item whose text carries every number', () => {
    renderTrack(WARD_A);

    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Ward A')).toBeInTheDocument();
    expect(item).toHaveTextContent('17 of 20');
    expect(item).toHaveTextContent('occupied 17');
    expect(item).toHaveTextContent('cleaning 2');
    expect(item).toHaveTextContent('free 1');
  });

  it('counts cleaning and maintenance together, since both are beds nobody can use yet', () => {
    renderTrack(WARD_A);

    expect(screen.getByRole('listitem')).toHaveTextContent('cleaning 2');
  });

  it('hides the drawn track from assistive tech', () => {
    const { container } = renderTrack(WARD_A);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('badges a ward with no free beds as Full', () => {
    renderTrack(FULL);

    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('free 0');
  });

  it('does not say Full while a bed is free', () => {
    renderTrack(WARD_A);

    expect(screen.queryByText('Full')).not.toBeInTheDocument();
  });

  it('does not call an empty ward Full', () => {
    renderTrack({ ward: 'Ward C', total: 0, occupied: 0, available: 0, byStatus: {}, occupancyRate: 0 });

    expect(screen.queryByText('Full')).not.toBeInTheDocument();
  });

  it('draws in from the left on first paint', () => {
    const { container } = renderTrack(WARD_A);

    expect(container.querySelector('clipPath rect')).toHaveAttribute('width', '0%');
  });

  it('renders the track complete when told this is not the first visit', () => {
    const { container } = renderTrack(WARD_A, false);

    expect(container.querySelector('clipPath rect')).toHaveAttribute('width', '100%');
  });

  it('renders the track complete under reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = renderTrack(WARD_A);

    expect(container.querySelector('clipPath rect')).toHaveAttribute('width', '100%');
  });
});
