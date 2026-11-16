import { describe, expect, it } from 'vitest';

import { shiftWindow } from './shift';

// Local-time constructors on purpose: a shift starts at 07:00 on the ward's wall clock.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

describe('shiftWindow', () => {
  it('starts a morning shift at 07:00 today', () => {
    const window = shiftWindow('morning', at(16, 10));
    expect(window.from).toEqual(at(16, 7));
    expect(window.label).toBe('This shift');
  });

  it('starts an evening shift at 15:00 today', () => {
    expect(shiftWindow('evening', at(16, 16)).from).toEqual(at(16, 15));
  });

  it('reaches back to the previous day for a night shift seen after midnight', () => {
    expect(shiftWindow('night', at(16, 2)).from).toEqual(at(15, 23));
  });

  it('starts a night shift at 23:00 today once it is underway', () => {
    expect(shiftWindow('night', at(16, 23, 30)).from).toEqual(at(16, 23));
  });

  it('uses the most recent start when the shift has not begun today', () => {
    expect(shiftWindow('morning', at(16, 5)).from).toEqual(at(15, 7));
  });

  it('falls back to the last 12 hours for on-call or no shift', () => {
    for (const shift of ['on_call', undefined, 'something_new']) {
      const window = shiftWindow(shift, at(16, 10));
      expect(window.from).toEqual(at(15, 22));
      expect(window.label).toBe('Last 12 hours');
    }
  });
});
