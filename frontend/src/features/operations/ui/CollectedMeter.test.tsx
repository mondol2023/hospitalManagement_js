import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatMoney } from '@/shared/lib/money';

import { CollectedMeter } from './CollectedMeter';

describe('CollectedMeter', () => {
  it('is a meter whose value, max and text carry the money and the percentage', () => {
    render(<CollectedMeter billedCents={6_190_000} collectedCents={4_821_000} />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuenow', '4821000');
    expect(meter).toHaveAttribute('aria-valuemax', '6190000');
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      `${formatMoney(4_821_000)} collected of ${formatMoney(6_190_000)} billed, 78 percent`
    );
  });

  it('says so, and draws no meter, when nothing was billed', () => {
    render(<CollectedMeter billedCents={0} collectedCents={0} />);

    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText('No bills raised in this period.')).toBeInTheDocument();
  });

  it('keeps the value inside the range when a refund-free overpayment makes collected exceed billed', () => {
    render(<CollectedMeter billedCents={1000} collectedCents={1500} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1000');
  });

  it('formats in the currency it is given', () => {
    render(<CollectedMeter billedCents={2000} collectedCents={500} currency="EUR" />);

    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toContain(
      formatMoney(500, 'EUR')
    );
  });
});
