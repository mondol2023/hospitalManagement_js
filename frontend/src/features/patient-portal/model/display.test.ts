import { describe, expect, it } from 'vitest';
import type { Bed } from '@/shared/types/domain';

import {
  APPOINTMENT_STATUS_WORDS,
  doctorNameOf,
  greetingLine,
  openBalance,
  readingsOf,
  relativeDay,
  salutation,
} from './display';

/** Local-time dates: "today" is a calendar idea, so the tests must not depend on the machine's zone. */
const at = (day: number, hour = 9, minute = 0, month = 10) =>
  new Date(2026, month, day, hour, minute).toISOString();

const NOW = new Date(2026, 10, 22, 9, 0);

describe('relativeDay', () => {
  it('says today and tomorrow in words', () => {
    expect(relativeDay(at(22, 15), NOW)).toBe('today');
    expect(relativeDay(at(23, 8), NOW)).toBe('tomorrow');
  });

  it('counts whole calendar days, not 24-hour blocks', () => {
    // 23:30 tonight is today even though it is under a day away — and 00:30
    // tomorrow is tomorrow even though it is only an hour later.
    expect(relativeDay(at(22, 23, 30), new Date(2026, 10, 22, 22, 0))).toBe('today');
    expect(relativeDay(at(23, 0, 30), new Date(2026, 10, 22, 22, 0))).toBe('tomorrow');
  });

  it('says "in N days" within the week and a date beyond it', () => {
    expect(relativeDay(at(25), NOW)).toBe('in 3 days');
    expect(relativeDay(at(20, 9, 0, 11), NOW)).toMatch(/Dec/);
  });
});

describe('greetingLine', () => {
  const visit = { scheduledAt: at(24) };

  it('prefers the ward when the patient is admitted', () => {
    expect(
      greetingLine({
        patient: {
          isAdmitted: true,
          ward: 'Cardiology',
          bed: { id: 'b1', bedNumber: '12' } as Bed,
        },
        next: visit,
        now: NOW,
      })
    ).toBe("You're staying with us in Cardiology, bed 12");
  });

  it('drops the bed when the bed is only an id', () => {
    expect(
      greetingLine({
        patient: { isAdmitted: true, ward: 'Cardiology', bed: 'b1' },
        next: null,
        now: NOW,
      })
    ).toBe("You're staying with us in Cardiology");
  });

  it('falls back to the next visit when not admitted', () => {
    expect(greetingLine({ patient: { isAdmitted: false }, next: visit, now: NOW })).toBe(
      'Your next visit is in 2 days'
    );
  });

  it('says nothing when there is nothing to say', () => {
    expect(greetingLine({ patient: { isAdmitted: false }, next: null, now: NOW })).toBeNull();
    expect(greetingLine({ patient: undefined, next: undefined, now: NOW })).toBeNull();
  });

  it('still announces a visit when the patient record is unavailable', () => {
    expect(greetingLine({ patient: undefined, next: visit, now: NOW })).toBe(
      'Your next visit is in 2 days'
    );
  });
});

describe('readingsOf', () => {
  it('lists only the readings present, each with its unit', () => {
    expect(readingsOf({ systolicBp: 120, diastolicBp: 80, heartRateBpm: 72 })).toEqual([
      { label: 'Blood pressure', value: '120/80', unit: 'mmHg' },
      { label: 'Heart rate', value: '72', unit: 'bpm' },
    ]);
  });

  it('never shows a zero or a dash for a missing reading', () => {
    expect(readingsOf({ temperatureC: 36.8 })).toEqual([
      { label: 'Temperature', value: '36.8', unit: '°C' },
    ]);
    expect(readingsOf(undefined)).toEqual([]);
    expect(readingsOf({})).toEqual([]);
  });

  it('keeps a real zero (a pain score of 0 is a reading)', () => {
    expect(readingsOf({ painScore: 0 })).toEqual([
      { label: 'Pain', value: '0', unit: 'out of 10' },
    ]);
  });

  it('shows one half of a blood pressure rather than inventing the other', () => {
    expect(readingsOf({ systolicBp: 130 })).toEqual([
      { label: 'Blood pressure', value: '130', unit: 'mmHg (top number)' },
    ]);
  });
});

describe('openBalance', () => {
  it('sums total minus paid across bills', () => {
    expect(
      openBalance([
        { totalCents: 10_000, paidCents: 2_500, currency: 'USD' },
        { totalCents: 5_000, paidCents: 0, currency: 'USD' },
      ])
    ).toEqual({ cents: 12_500, currency: 'USD' });
  });

  it('never goes below zero for an over-paid bill', () => {
    expect(openBalance([{ totalCents: 1_000, paidCents: 1_500, currency: 'USD' }]).cents).toBe(0);
  });

  it('is zero for no bills', () => {
    expect(openBalance([]).cents).toBe(0);
  });
});

describe('APPOINTMENT_STATUS_WORDS', () => {
  it('uses the patient’s words', () => {
    expect(APPOINTMENT_STATUS_WORDS.pending).toBe('Waiting for confirmation');
    expect(APPOINTMENT_STATUS_WORDS.confirmed).toBe('Confirmed');
  });
});

describe('salutation', () => {
  it('follows the hour in the browser’s zone', () => {
    expect(salutation(new Date(2026, 10, 22, 6, 0))).toBe('Good morning');
    expect(salutation(new Date(2026, 10, 22, 11, 59))).toBe('Good morning');
    expect(salutation(new Date(2026, 10, 22, 12, 0))).toBe('Good afternoon');
    expect(salutation(new Date(2026, 10, 22, 17, 59))).toBe('Good afternoon');
    expect(salutation(new Date(2026, 10, 22, 18, 0))).toBe('Good evening');
    expect(salutation(new Date(2026, 10, 22, 2, 0))).toBe('Good evening');
  });
});

describe('doctorNameOf', () => {
  it('uses the name when the doctor arrived populated', () => {
    expect(doctorNameOf({ id: 'u1', name: 'Dr Imani Khan' } as never)).toBe('Dr Imani Khan');
  });

  it('says "Your doctor" for a bare id, a missing doctor or a nameless one', () => {
    expect(doctorNameOf('u-gone')).toBe('Your doctor');
    expect(doctorNameOf(null)).toBe('Your doctor');
    expect(doctorNameOf(undefined)).toBe('Your doctor');
    expect(doctorNameOf({ id: 'u1', name: '' } as never)).toBe('Your doctor');
  });
});
