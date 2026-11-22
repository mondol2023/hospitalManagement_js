import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { SeriesPoint } from '@/features/dashboard';
import { formatMoney } from '@/shared/lib/money';

import { TrendBars } from './TrendBars';

function day(d: number): string {
  return new Date(2026, 9, d, 12, 0).toISOString();
}

const POINTS: SeriesPoint[] = [
  { recordedAt: day(21), value: 80_000 },
  { recordedAt: day(22), value: 142_000 },
  { recordedAt: day(23), value: 0 },
  { recordedAt: day(24), value: 96_000 },
];

describe('TrendBars', () => {
  it('has one bar per day, each reachable by name', () => {
    render(<TrendBars points={POINTS} />);

    expect(screen.getAllByRole('img', { name: /collected/i })).toHaveLength(4);
    expect(
      screen.getByRole('img', { name: `22 Oct, ${formatMoney(142_000)} collected` })
    ).toBeInTheDocument();
  });

  it('is a single tab stop, and the arrow keys move between the bars', async () => {
    const user = userEvent.setup();
    render(<TrendBars points={POINTS} />);

    await user.tab();
    const bars = screen.getAllByRole('img', { name: /collected/i });
    expect(bars[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(bars[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(bars[3]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(bars[3]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(bars[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(bars[0]).toHaveFocus();
  });

  it('leaves only the active bar in the tab order', () => {
    render(<TrendBars points={POINTS} />);

    const tabbable = screen
      .getAllByRole('img', { name: /collected/i })
      .filter((bar) => bar.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('shows the same numbers as a table on request, with a day with nothing collected', async () => {
    const user = userEvent.setup();
    render(<TrendBars points={POINTS} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show as table/i }));

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + POINTS.length);
    expect(within(table).getByText(formatMoney(142_000))).toBeInTheDocument();
    expect(within(table).getByText(formatMoney(0))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide table/i }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('labels only the first day, the last day and the peak', () => {
    const { container } = render(<TrendBars points={POINTS} />);

    const labels = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['21 Oct', '24 Oct']));
    expect(labels).toContain(formatMoney(142_000));
    expect(labels).toHaveLength(3);
  });

  it('says when the server cut the range short', () => {
    render(<TrendBars points={POINTS} truncated />);

    expect(screen.getByText('Showing the latest 4 days.')).toBeInTheDocument();
  });

  it('says nothing about truncation when the range is whole', () => {
    render(<TrendBars points={POINTS} />);

    expect(screen.queryByText(/showing the latest/i)).not.toBeInTheDocument();
  });

  it('says so when there are no days to draw, and draws nothing', () => {
    render(<TrendBars points={[]} />);

    expect(screen.getByText('No collections recorded in this period.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /table/i })).not.toBeInTheDocument();
  });
});
