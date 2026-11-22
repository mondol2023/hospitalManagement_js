import { describe, expect, it } from 'vitest';

import { daysToExpiry, expiresIn, quantityLabel } from './display';

describe('daysToExpiry', () => {
  // Local-time dates, so the test does not depend on the machine's timezone.
  const morning = new Date(2026, 10, 22, 9, 0);
  const night = new Date(2026, 10, 22, 21, 0);

  it('counts calendar days, so the answer does not change through the day', () => {
    const tomorrow = new Date(2026, 10, 23, 0, 0);
    expect(daysToExpiry(tomorrow, morning)).toBe(1);
    expect(daysToExpiry(tomorrow, night)).toBe(1);
  });

  it('is 0 for a batch that expires later today', () => {
    expect(daysToExpiry(new Date(2026, 10, 22, 23, 59), morning)).toBe(0);
  });

  it('counts across a month end', () => {
    expect(daysToExpiry(new Date(2026, 11, 1, 0, 0), morning)).toBe(9);
  });
});

describe('quantityLabel', () => {
  it('pluralises counted units and leaves measures alone', () => {
    expect(quantityLabel(120, 'capsule')).toBe('120 capsules');
    expect(quantityLabel(1, 'vial')).toBe('1 vial');
    expect(quantityLabel(0, 'tablet')).toBe('0 tablets');
    expect(quantityLabel(40, 'ml')).toBe('40 ml');
    expect(quantityLabel(1, 'ml')).toBe('1 ml');
  });
});

describe('expiresIn', () => {
  it('uses words for today and tomorrow, and a count after that', () => {
    expect(expiresIn(0)).toBe('today');
    expect(expiresIn(1)).toBe('tomorrow');
    expect(expiresIn(9)).toBe('in 9 days');
  });
});
