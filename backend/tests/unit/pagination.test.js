'use strict';

const { parsePagination, parseSort, buildPage } = require('../../src/utils/pagination');
const { PAGINATION } = require('../../src/utils/constants');

/**
 * Pagination parsing, tested as what it is: an untrusted-input boundary.
 *
 * `req.query` is a string map an attacker controls entirely, and these three
 * functions are all that stands between it and a Mongo cursor. The interesting
 * cases are therefore the malformed ones — `?limit=0`, `?limit=1e9`,
 * `?sort=$where`, `?page=-1` — because each has a plausible implementation that
 * turns into an unbounded scan, a negative `skip`, or an in-memory sort of a
 * whole collection.
 */

describe('parsePagination — defaults', () => {
  it('needs no query at all', () => {
    expect(parsePagination()).toEqual({
      page: PAGINATION.DEFAULT_PAGE,
      limit: PAGINATION.DEFAULT_LIMIT,
      skip: 0,
    });
    expect(parsePagination({})).toEqual(parsePagination());
  });

  it('falls back rather than propagating nonsense', () => {
    // Every one of these has a natural implementation that produces NaN, and
    // `skip: NaN` is a driver error at the far end of a request.
    for (const bad of ['', 'abc', '-1', '0', null, undefined, {}, []]) {
      const { page, limit, skip } = parsePagination({ page: bad, limit: bad });
      expect(page).toBe(PAGINATION.DEFAULT_PAGE);
      expect(limit).toBe(PAGINATION.DEFAULT_LIMIT);
      expect(skip).toBe(0);
    }
  });

  it('reads the numeric prefix of a sloppy value', () => {
    // `parseInt` semantics, stated so the behaviour is a decision rather than an
    // accident: '3abc' is a page-3 request, not a rejection.
    expect(parsePagination({ page: '3abc' }).page).toBe(3);
  });
});

describe('parsePagination — bounds', () => {
  it('caps the page size no matter what is asked for', () => {
    // The ceiling is the point of the whole module: without it `?limit=999999`
    // streams a collection into memory.
    for (const greedy of ['101', '1000', '999999999', String(Number.MAX_SAFE_INTEGER)]) {
      expect(parsePagination({ limit: greedy }).limit).toBe(PAGINATION.MAX_LIMIT);
    }
  });

  it('accepts a page size under the cap unchanged', () => {
    expect(parsePagination({ limit: '5' }).limit).toBe(5);
    expect(parsePagination({ limit: String(PAGINATION.MAX_LIMIT) }).limit).toBe(
      PAGINATION.MAX_LIMIT
    );
  });

  it('never produces a negative skip', () => {
    for (const page of ['-5', '0', '-0', 'abc']) {
      expect(parsePagination({ page }).skip).toBeGreaterThanOrEqual(0);
    }
  });

  it('computes skip from the clamped limit, not the requested one', () => {
    // Skipping `(page-1) * requested` while returning `clamped` rows would make
    // page 2 start 999900 documents into the collection: a silently empty page.
    const { limit, skip } = parsePagination({ page: '3', limit: '1000000' });
    expect(limit).toBe(PAGINATION.MAX_LIMIT);
    expect(skip).toBe(2 * PAGINATION.MAX_LIMIT);
  });
});

describe('parseSort', () => {
  const allowed = ['createdAt', 'name'];

  it('maps the leading minus to descending', () => {
    expect(parseSort('-createdAt', allowed)).toEqual({ createdAt: -1 });
    expect(parseSort('name', allowed)).toEqual({ name: 1 });
  });

  it('keeps the order of a multi-field sort', () => {
    expect(Object.entries(parseSort('-createdAt,name', allowed))).toEqual([
      ['createdAt', -1],
      ['name', 1],
    ]);
  });

  it('drops fields outside the whitelist and keeps the rest', () => {
    // Partial acceptance, not rejection: the client still gets a sorted page,
    // just not one ordered by a field with no index behind it.
    expect(parseSort('-createdAt,ssn', allowed)).toEqual({ createdAt: -1 });
  });

  it('falls back when nothing survives the whitelist', () => {
    const fallback = { createdAt: -1 };
    for (const hostile of ['ssn', '$where', 'password,-password', '-', ',,,', '   ']) {
      expect(parseSort(hostile, allowed)).toEqual(fallback);
    }
  });

  it('falls back on anything that is not a string', () => {
    // `?sort[$ne]=1` arrives as an object. Reaching `.split` on it would throw a
    // 500 out of a query-string typo.
    for (const bad of [undefined, null, '', 42, {}, ['name'], { $ne: 1 }]) {
      expect(parseSort(bad, allowed)).toEqual({ createdAt: -1 });
    }
  });

  it('tolerates whitespace around the separators', () => {
    expect(parseSort(' name , -createdAt ', allowed)).toEqual({ name: 1, createdAt: -1 });
  });

  it('honours a caller-supplied fallback and an empty whitelist', () => {
    expect(parseSort('name', allowed, { name: 1 })).toEqual({ name: 1 });
    expect(parseSort('anything', [], { scheduledAt: 1 })).toEqual({ scheduledAt: 1 });
  });
});

describe('buildPage', () => {
  const items = [{ id: 1 }];

  it('reports the position within the result set', () => {
    const { pagination } = buildPage({ items, total: 45, page: 2, limit: 20 });
    expect(pagination).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it('rounds a partial last page up', () => {
    expect(buildPage({ items, total: 41, page: 1, limit: 20 }).pagination.totalPages).toBe(3);
  });

  it('closes both directions on an empty result set', () => {
    const { pagination } = buildPage({ items: [], total: 0, page: 1, limit: 20 });
    expect(pagination.totalPages).toBe(0);
    expect(pagination.hasNextPage).toBe(false);
    expect(pagination.hasPrevPage).toBe(false);
  });

  it('closes the forward direction on the last page', () => {
    const { pagination } = buildPage({ items, total: 40, page: 2, limit: 20 });
    expect(pagination.hasNextPage).toBe(false);
    expect(pagination.hasPrevPage).toBe(true);
  });

  it('reports no pages rather than Infinity when the limit is zero', () => {
    // `total / 0` is Infinity, which serialises to `null` and makes a client's
    // "last page" link jump nowhere.
    expect(buildPage({ items: [], total: 10, page: 1, limit: 0 }).pagination.totalPages).toBe(0);
  });

  it('passes the items through untouched', () => {
    expect(buildPage({ items, total: 1, page: 1, limit: 20 }).items).toBe(items);
  });
});
