import { describe, expect, it } from 'vitest';

import { DEFAULT_DAYS, isValidDays, parseDays, parseTab } from './report-params';

describe('parseDays', () => {
  it('reads a whole number in range', () => {
    expect(parseDays('7')).toBe(7);
    expect(parseDays('365')).toBe(365);
    expect(parseDays('1')).toBe(1);
  });

  it.each([null, '', 'abc', '0', '366', '-5', '2.5', '1e2', ' 7'])(
    'falls back to the default for %j',
    (raw) => {
      expect(parseDays(raw)).toBe(DEFAULT_DAYS);
    }
  );
});

describe('isValidDays', () => {
  it('accepts only whole numbers from 1 to 365', () => {
    expect(isValidDays(1)).toBe(true);
    expect(isValidDays(365)).toBe(true);
    expect(isValidDays(0)).toBe(false);
    expect(isValidDays(366)).toBe(false);
    expect(isValidDays(1.5)).toBe(false);
    expect(isValidDays(Number.NaN)).toBe(false);
  });
});

describe('parseTab', () => {
  it('defaults to the stock report', () => {
    expect(parseTab(null)).toBe('stock');
    expect(parseTab('nonsense')).toBe('stock');
  });

  it('reads the movements tab', () => {
    expect(parseTab('movements')).toBe('movements');
  });
});
