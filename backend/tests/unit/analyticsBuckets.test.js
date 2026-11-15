'use strict';

const { bucketStart, bucketRange, defaultWindowStart, rate } = require('../../src/services/analytics/buckets');

const iso = (d) => d.toISOString();

describe('analytics buckets', () => {
  const wed = new Date('2026-11-18T10:45:30Z');

  it('floors to the start of each period in UTC', () => {
    expect(iso(bucketStart(wed, 'hourly'))).toBe('2026-11-18T10:00:00.000Z');
    expect(iso(bucketStart(wed, 'daily'))).toBe('2026-11-18T00:00:00.000Z');
    expect(iso(bucketStart(wed, 'weekly'))).toBe('2026-11-16T00:00:00.000Z');
    expect(iso(bucketStart(wed, 'monthly'))).toBe('2026-11-01T00:00:00.000Z');
  });

  it('starts weeks on Monday, including when the date is a Sunday', () => {
    expect(iso(bucketStart(new Date('2026-11-22T23:59:00Z'), 'weekly'))).toBe('2026-11-16T00:00:00.000Z');
    expect(iso(bucketStart(new Date('2026-11-16T00:00:00Z'), 'weekly'))).toBe('2026-11-16T00:00:00.000Z');
  });

  it('rejects an unparseable date', () => {
    expect(() => bucketStart('nope', 'daily')).toThrow('Invalid date');
  });

  it('returns a half-open range one period long', () => {
    const start = bucketStart(wed, 'weekly');
    expect(iso(bucketRange(start, 'weekly').end)).toBe('2026-11-23T00:00:00.000Z');
    expect(iso(bucketRange(bucketStart(wed, 'monthly'), 'monthly').end)).toBe('2026-12-01T00:00:00.000Z');
    expect(iso(bucketRange(bucketStart(wed, 'hourly'), 'hourly').end)).toBe('2026-11-18T11:00:00.000Z');
  });

  it('looks back a sensible default window per period', () => {
    expect(iso(defaultWindowStart(new Date('2026-11-18T00:00:00Z'), 'daily'))).toBe('2026-10-19T00:00:00.000Z');
  });

  it('treats zero capacity as 0%, to one decimal otherwise', () => {
    expect(rate(0, 0)).toBe(0);
    expect(rate(1, 3)).toBe(33.3);
  });
});
