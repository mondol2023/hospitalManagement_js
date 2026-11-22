import { describe, expect, it } from 'vitest';

import { dayFromParam, partyOf, shiftDay, visitWindow } from './display';

describe('partyOf', () => {
  it('shows the name with the MRN', () => {
    expect(
      partyOf({
        id: 'p1',
        medicalRecordNumber: 'MRN-7',
        user: { id: 'u1', name: 'Ada Lovelace' },
      } as never)
    ).toEqual({ name: 'Ada Lovelace', mrn: 'MRN-7' });
  });

  // The user link is a bare id when nothing populated it: the MRN is all we have.
  it('falls back to the MRN alone when the user is not populated', () => {
    expect(
      partyOf({ id: 'p1', medicalRecordNumber: 'MRN-7', user: 'u1' } as never)
    ).toEqual({ name: 'MRN-7', mrn: undefined });
  });

  // A deleted patient comes back as null or as a bare id; neither may crash a list.
  it.each([null, undefined, 'p1'])('shows a neutral placeholder for %s', (patient) => {
    expect(partyOf(patient as never)).toEqual({ name: 'Unknown patient', mrn: undefined });
  });
});

describe('dayFromParam', () => {
  it('keeps a valid ?date=', () => {
    expect(dayFromParam('2026-11-21', '2026-11-20')).toBe('2026-11-21');
  });

  it.each([null, '', 'tomorrow', '2026-13-40', '2026-2-3'])(
    'falls back to today for %j, so a hand-edited link still opens a day',
    (value) => {
      expect(dayFromParam(value, '2026-11-20')).toBe('2026-11-20');
    }
  );
});

describe('shiftDay', () => {
  it('steps a day forward and back', () => {
    expect(shiftDay('2026-11-21', 1)).toBe('2026-11-22');
    expect(shiftDay('2026-11-21', -1)).toBe('2026-11-20');
  });

  it('crosses month and year ends', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('visitWindow', () => {
  const at = (iso: string) => ({ scheduledAt: iso, endsAt: iso });

  it('finds the visit in progress when there is one', () => {
    const rows = [
      { id: 'a', status: 'completed', scheduledAt: '2026-11-21T08:00:00Z', endsAt: '2026-11-21T08:30:00Z' },
      { id: 'b', status: 'confirmed', scheduledAt: '2026-11-21T09:00:00Z', endsAt: '2026-11-21T09:30:00Z' },
      { id: 'c', status: 'confirmed', scheduledAt: '2026-11-21T10:00:00Z', endsAt: '2026-11-21T10:30:00Z' },
    ];
    expect(visitWindow(rows, new Date('2026-11-21T09:10:00Z'))).toBe('b');
  });

  it('otherwise points at the next open visit', () => {
    const rows = [
      { id: 'a', status: 'completed', scheduledAt: '2026-11-21T08:00:00Z', endsAt: '2026-11-21T08:30:00Z' },
      { id: 'c', status: 'confirmed', scheduledAt: '2026-11-21T10:00:00Z', endsAt: '2026-11-21T10:30:00Z' },
    ];
    expect(visitWindow(rows, new Date('2026-11-21T09:45:00Z'))).toBe('c');
  });

  // A finished or missed visit is behind the doctor, whatever the clock says.
  it('never marks a completed or no-show visit', () => {
    const rows = [
      { id: 'a', status: 'completed', ...at('2026-11-21T09:00:00Z'), endsAt: '2026-11-21T09:30:00Z' },
      { id: 'b', status: 'no_show', scheduledAt: '2026-11-21T09:30:00Z', endsAt: '2026-11-21T10:00:00Z' },
    ];
    expect(visitWindow(rows, new Date('2026-11-21T09:10:00Z'))).toBeNull();
  });

  it('is null when everything is over', () => {
    const rows = [
      { id: 'a', status: 'confirmed', scheduledAt: '2026-11-21T08:00:00Z', endsAt: '2026-11-21T08:30:00Z' },
    ];
    expect(visitWindow(rows, new Date('2026-11-21T12:00:00Z'))).toBeNull();
  });
});
