import { describe, expect, it } from 'vitest';

import { customDayRange, isPast, lastDaysRange, todayRange } from './hospital-day';

describe('lastDaysRange', () => {
  // "Last 30 days" on 22 Nov reads "23 Oct – 22 Nov": the window opens at local
  // midnight thirty days back and closes with today, so today's takings count.
  it('opens at local midnight N days back and closes at the end of today', () => {
    const range = lastDaysRange(30, new Date(2026, 10, 22, 14, 5));

    expect(range.from).toBe('2026-10-22T18:00:00.000Z');
    expect(range.to).toBe('2026-11-22T17:59:59.999Z');
  });

  it('gives the same window at any time of day, so a query key does not drift', () => {
    expect(lastDaysRange(7, new Date(2026, 10, 22, 0, 0))).toEqual(
      lastDaysRange(7, new Date(2026, 10, 22, 23, 59, 59))
    );
  });

  it('counts calendar days across a month boundary', () => {
    const { from } = lastDaysRange(7, new Date(2026, 10, 3, 9, 0));

    expect(new Date(from).getTime()).toBe(new Date(2026, 9, 27, 0, 0).getTime());
  });

  it('always satisfies the server’s from < to', () => {
    const { from, to } = lastDaysRange(7, new Date(2026, 10, 22, 12, 0));

    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });
});

describe('customDayRange', () => {
  it('turns two calendar days into local midnight and the end of the last day', () => {
    expect(customDayRange('2026-11-01', '2026-11-22')).toEqual({
      from: '2026-10-31T18:00:00.000Z',
      to: '2026-11-22T17:59:59.999Z',
    });
  });

  it('allows a single day', () => {
    const range = customDayRange('2026-11-22', '2026-11-22');

    expect(range).not.toBeNull();
    expect(new Date(range!.from).getTime()).toBeLessThan(new Date(range!.to).getTime());
  });

  it('rejects a start after the end', () => {
    expect(customDayRange('2026-11-23', '2026-11-22')).toBeNull();
  });

  it('rejects anything that is not a real calendar day', () => {
    expect(customDayRange('', '2026-11-22')).toBeNull();
    expect(customDayRange('2026-11-01', 'soon')).toBeNull();
    // new Date(2026, 1, 31) rolls over to 3 March; that must not pass as a date.
    expect(customDayRange('2026-02-31', '2026-03-05')).toBeNull();
  });
});

describe('todayRange', () => {
  // The run is pinned to Asia/Dhaka (UTC+6) in vitest.global-setup.mjs, so local
  // midnight is 18:00 UTC the evening before. A helper that cut the day at UTC
  // midnight would fail here.
  it('runs from local midnight to the last millisecond of the local day', () => {
    const range = todayRange(new Date(2026, 10, 22, 14, 5));

    expect(range.from).toBe('2026-11-21T18:00:00.000Z');
    expect(range.to).toBe('2026-11-22T17:59:59.999Z');
  });

  it('keeps a visit at 00:00 local inside today, not yesterday', () => {
    const { from } = todayRange(new Date(2026, 10, 22, 0, 0, 0, 0));

    expect(new Date(from).getTime()).toBe(new Date(2026, 10, 22, 0, 0, 0, 0).getTime());
  });

  it('still reports the same day at 23:59 local', () => {
    expect(todayRange(new Date(2026, 10, 22, 23, 59, 30))).toEqual(
      todayRange(new Date(2026, 10, 22, 6, 0))
    );
  });

  // The server filters `scheduledAt <= to`; an exclusive-looking next midnight
  // would pull tomorrow's 00:00 visit into today's list.
  it('ends before tomorrow’s midnight', () => {
    const { to } = todayRange(new Date(2026, 10, 22, 9, 0));

    expect(new Date(to).getTime()).toBeLessThan(new Date(2026, 10, 23, 0, 0).getTime());
  });

  it('defaults to the current time', () => {
    const { from, to } = todayRange();
    const now = Date.now();

    expect(new Date(from).getTime()).toBeLessThanOrEqual(now);
    expect(new Date(to).getTime()).toBeGreaterThanOrEqual(now);
  });
});

describe('isPast', () => {
  const now = new Date('2026-11-22T10:00:00.000Z');

  it('is true for an earlier instant', () => {
    expect(isPast('2026-11-22T09:59:59.999Z', now)).toBe(true);
  });

  it('is false for a later instant', () => {
    expect(isPast('2026-11-22T10:00:00.001Z', now)).toBe(false);
  });

  // The server sweeps `expiryDate <= now` (medicineRepository.expiringBefore),
  // so the page must call the same instant "expired" or the list and the
  // write-off disagree about which batches are in it.
  it('counts the exact instant as past, matching the server’s <=', () => {
    expect(isPast('2026-11-22T10:00:00.000Z', now)).toBe(true);
  });

  it('counts a batch dated today at midnight as expired by the afternoon', () => {
    expect(isPast(new Date(2026, 10, 22, 0, 0), new Date(2026, 10, 22, 14, 0))).toBe(true);
  });

  it('is false for a missing or unparsable date, never "expired"', () => {
    expect(isPast(undefined, now)).toBe(false);
    expect(isPast('not a date', now)).toBe(false);
  });
});
