import { describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  MOVEMENTS_PAGE_SIZE,
  hasActiveFilters,
  movementRequest,
  parseMovementFilters,
  writeMovementFilters,
  type MovementFilters,
} from './movement-filters';

const MEDICINE = '64b7f0c2a1d3e4f5a6b7c8d9';
const ACTOR = '64b7f0c2a1d3e4f5a6b7c8da';

const parse = (query: string) => parseMovementFilters(new URLSearchParams(query));
const filters = (over: Partial<MovementFilters>): MovementFilters => ({ ...EMPTY_FILTERS, ...over });

describe('parseMovementFilters', () => {
  it('reads nothing from an empty URL', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS);
  });

  it('reads every filter and the page', () => {
    expect(
      parse(
        `tab=movements&kind=restock&medicine=${MEDICINE}&actor=${ACTOR}&from=2026-11-01&to=2026-11-20&page=3`
      )
    ).toEqual({
      kind: 'restock',
      medicine: MEDICINE,
      actor: ACTOR,
      from: '2026-11-01',
      to: '2026-11-20',
      page: 3,
    });
  });

  it('ignores a kind it does not know', () => {
    expect(parse('kind=theft').kind).toBeNull();
  });

  it.each(['abc', '123', '', `${MEDICINE}0`])('ignores a medicine id that is not an id: %s', (bad) => {
    expect(parse(`medicine=${bad}`).medicine).toBeNull();
  });

  it.each(['2026-13-01', '2026-02-30', '2026-1-5', 'yesterday', '2026-11-20T00:00:00Z'])(
    'ignores a date that is not a real calendar day: %s',
    (bad) => {
      expect(parse(`from=${bad}`).from).toBeNull();
      expect(parse(`to=${bad}`).to).toBeNull();
    }
  );

  it.each([['0'], ['-2'], ['1.5'], ['abc'], ['']])('reads page %s as 1', (bad) => {
    expect(parse(`page=${bad}`).page).toBe(1);
  });
});

describe('writeMovementFilters', () => {
  it('always names the movements tab and leaves out what is empty', () => {
    expect(writeMovementFilters(EMPTY_FILTERS).toString()).toBe('tab=movements');
  });

  it('writes every set filter, and the page only past the first', () => {
    const written = writeMovementFilters(
      filters({ kind: 'adjust', medicine: MEDICINE, actor: ACTOR, from: '2026-11-01', to: '2026-11-20', page: 2 })
    );

    expect(Object.fromEntries(written)).toEqual({
      tab: 'movements',
      kind: 'adjust',
      medicine: MEDICINE,
      actor: ACTOR,
      from: '2026-11-01',
      to: '2026-11-20',
      page: '2',
    });
    expect(writeMovementFilters(filters({ page: 1 })).has('page')).toBe(false);
  });

  it('round-trips through parse', () => {
    const original = filters({ kind: 'withdrawn', actor: ACTOR, to: '2026-11-20', page: 4 });

    expect(parseMovementFilters(writeMovementFilters(original))).toEqual(original);
  });
});

describe('hasActiveFilters', () => {
  it('is false for no filters, and false for a page alone', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ page: 3 }))).toBe(false);
  });

  it.each([
    [{ kind: 'restock' as const }],
    [{ medicine: MEDICINE }],
    [{ actor: ACTOR }],
    [{ from: '2026-11-01' }],
    [{ to: '2026-11-01' }],
  ])('is true when %o is set', (over) => {
    expect(hasActiveFilters(filters(over))).toBe(true);
  });
});

describe('movementRequest', () => {
  it('asks for the newest 25 and omits every empty filter', () => {
    const { params, rangeError } = movementRequest(EMPTY_FILTERS);

    expect(rangeError).toBeNull();
    expect(params).toEqual({ page: 1, limit: MOVEMENTS_PAGE_SIZE, sort: '-createdAt' });
    expect(MOVEMENTS_PAGE_SIZE).toBe(25);
    expect(params).not.toHaveProperty('kind');
    expect(params).not.toHaveProperty('from');
  });

  it('sends the chosen filters and the page', () => {
    const { params } = movementRequest(filters({ kind: 'dispense', medicine: MEDICINE, actor: ACTOR, page: 2 }));

    expect(params).toEqual({
      page: 2,
      limit: 25,
      sort: '-createdAt',
      kind: 'dispense',
      medicine: MEDICINE,
      actor: ACTOR,
    });
  });

  it('turns "from" into the start of that local day and "to" into its last millisecond', () => {
    const { params } = movementRequest(filters({ from: '2026-11-03', to: '2026-11-03' }));

    expect(params?.from).toBe(new Date(2026, 10, 3, 0, 0, 0, 0).toISOString());
    expect(params?.to).toBe(new Date(2026, 10, 3, 23, 59, 59, 999).toISOString());
  });

  it('accepts the same day for both ends', () => {
    expect(movementRequest(filters({ from: '2026-11-03', to: '2026-11-03' })).rangeError).toBeNull();
  });

  it('sends no request when the range runs backwards, and says why', () => {
    const result = movementRequest(filters({ from: '2026-11-20', to: '2026-11-01' }));

    expect(result.params).toBeNull();
    expect(result.rangeError).toBe('End date must be on or after the start date.');
  });

  it('does not treat a lone date as a backwards range', () => {
    expect(movementRequest(filters({ from: '2026-11-20' })).params).not.toBeNull();
    expect(movementRequest(filters({ to: '2026-11-01' })).params).not.toBeNull();
  });
});
