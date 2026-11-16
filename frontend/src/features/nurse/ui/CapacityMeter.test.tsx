import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CapacityMeter } from './CapacityMeter';

describe('CapacityMeter', () => {
  it('exposes the load as a meter with a value, a maximum and a readable label', () => {
    render(<CapacityMeter assigned={6} capacity={8} atCapacity={false} />);

    const meter = screen.getByRole('meter', { name: /your patients/i });
    expect(meter).toHaveAttribute('aria-valuenow', '6');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '8');
    expect(meter).toHaveAttribute('aria-valuetext', '6 of 8 patients');
    expect(screen.getByText('Your patients: 6 of 8')).toBeInTheDocument();
  });

  it('says "At capacity" in words, not only in colour, when the caseload is full', () => {
    render(<CapacityMeter assigned={8} capacity={8} atCapacity />);

    expect(screen.getByText('At capacity')).toBeInTheDocument();
  });

  it('stays quiet below capacity', () => {
    render(<CapacityMeter assigned={6} capacity={8} atCapacity={false} />);

    expect(screen.queryByText('At capacity')).not.toBeInTheDocument();
  });

  it('does not overflow the track when the nurse is over capacity', () => {
    render(<CapacityMeter assigned={10} capacity={8} atCapacity />);

    const fill = screen.getByRole('meter').firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(1)');
  });

  it('copes with a capacity of zero', () => {
    render(<CapacityMeter assigned={0} capacity={0} atCapacity />);

    const fill = screen.getByRole('meter').firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0)');
  });
});
