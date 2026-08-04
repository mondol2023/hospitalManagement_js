'use strict';

const { CacheService, buildKey, NAMESPACE } = require('../../src/services/cacheService');

/**
 * The cache layer, tested against a fake that behaves like Redis — including
 * behaving like Redis having a bad day.
 *
 * The contract this file exists to hold is rule 1 from the module's own header:
 * *the cache is never load-bearing*. Redis is optional in this deployment and
 * can drop mid-request, so every method has to degrade to a miss rather than
 * throw. That is untestable through HTTP (the suite runs with Redis disabled, so
 * every path is the disabled one) and it is exactly the code that will not be
 * exercised until the night Redis actually falls over.
 *
 * The fake obeys the SCAN contract rather than mimicking one server's batching:
 * it returns two keys per call regardless of COUNT, because a real server is
 * free to return any number and code that assumes one round trip is wrong.
 */

const SCAN_BATCH = 2;

function fakeRedis() {
  const store = new Map();
  // Cursors index this append-only list rather than the live key set, because a
  // real SCAN cursor is a position in the hash table that deleting keys does not
  // shift. Indexing `store.keys()` would skip entries as `invalidate` unlinks
  // them — an artefact of the fake, not of the code under test.
  const seen = [];
  return {
    status: 'ready',
    store,
    get: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key, value) => {
      if (!store.has(key)) seen.push(key);
      store.set(key, value);
      return 'OK';
    }),
    unlink: jest.fn(async (...keys) => keys.filter((key) => store.delete(key)).length),
    scan: jest.fn(async (cursor, _match, pattern) => {
      const from = Number(cursor);
      const slice = seen.slice(from, from + SCAN_BATCH);
      const next = from + SCAN_BATCH >= seen.length ? '0' : String(from + SCAN_BATCH);
      const re = new RegExp(
        `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : `\\${c}`))}$`
      );
      return [next, slice.filter((key) => store.has(key) && re.test(key))];
    }),
    incr: jest.fn(async (key) => {
      const next = Number(store.get(key) || 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: jest.fn(async () => 1),
    exists: jest.fn(async (key) => (store.has(key) ? 1 : 0)),
    // Present so the SCAN-not-KEYS assertion can be made at all.
    keys: jest.fn(),
  };
}

/** A client that is up but fails every command, as during a failover. */
const brokenRedis = () =>
  new Proxy(
    { status: 'ready' },
    {
      get: (target, prop) =>
        prop in target ? target[prop] : jest.fn().mockRejectedValue(new Error('CONNRESET')),
    }
  );

describe('buildKey', () => {
  it('namespaces every key', () => {
    // The namespace is what makes `invalidate('doctors')` safe to run against a
    // Redis instance shared with anything else.
    expect(buildKey('doctors')).toBe(`${NAMESPACE}:doctors`);
  });

  it('sorts params so equivalent queries share one entry', () => {
    // `?page=1&limit=20` and `?limit=20&page=1` are the same page. Unsorted keys
    // would halve the hit rate for nothing.
    expect(buildKey('doctors', { page: 1, limit: 20 })).toBe(
      buildKey('doctors', { limit: 20, page: 1 })
    );
    expect(buildKey('doctors', { b: 2, a: 1 })).toBe(`${NAMESPACE}:doctors:a=1&b=2`);
  });

  it('ignores params that carry no filter', () => {
    // An absent `?search=` must hit the same entry as no `search` at all.
    expect(buildKey('doctors', { search: '', ward: null, page: undefined })).toBe(
      `${NAMESPACE}:doctors`
    );
  });

  it('distinguishes different values of the same param', () => {
    expect(buildKey('doctors', { ward: 'ICU' })).not.toBe(buildKey('doctors', { ward: 'ER' }));
  });
});

describe('CacheService — when Redis is switched off', () => {
  const off = new CacheService(null);

  it('reports itself disabled rather than pretending', () => {
    expect(off.isEnabled).toBe(false);
  });

  it('answers every read as a miss and every write as a no-op', async () => {
    await expect(off.get('k')).resolves.toBeNull();
    await expect(off.set('k', 1)).resolves.toBe(false);
    await expect(off.del('k')).resolves.toBe(0);
    await expect(off.invalidate('doctors')).resolves.toBe(0);
    await expect(off.increment('k', 60)).resolves.toBeNull();
    await expect(off.has('k')).resolves.toBe(false);
    await expect(off.mark('k', 60)).resolves.toBe(false);
  });

  it('still serves reads through `wrap`, just from the source', async () => {
    // This is the whole point: a Redis outage must be a latency event, not an
    // availability one.
    const producer = jest.fn().mockResolvedValue({ items: [] });
    await expect(off.wrap('k', producer)).resolves.toEqual({ items: [] });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('treats a connected-but-not-ready client as off', () => {
    // ioredis reports `connecting` / `reconnecting` during a failover, and
    // commands issued then queue up instead of failing fast.
    for (const status of ['connecting', 'reconnecting', 'end', undefined]) {
      expect(new CacheService({ status }).isEnabled).toBe(false);
    }
  });
});

describe('CacheService — reads and writes', () => {
  let client;
  let cache;

  beforeEach(() => {
    client = fakeRedis();
    cache = new CacheService(client, { defaultTtl: 300 });
  });

  it('round-trips a value through JSON', async () => {
    await cache.set('k', { id: 1, nested: [{ ok: true }] });
    await expect(cache.get('k')).resolves.toEqual({ id: 1, nested: [{ ok: true }] });
  });

  it('applies the default TTL, and an explicit one when given', async () => {
    // A cache entry with no expiry is a permanently stale response.
    await cache.set('k', 1);
    expect(client.set).toHaveBeenCalledWith('k', '1', 'EX', 300);
    await cache.set('k', 1, 30);
    expect(client.set).toHaveBeenLastCalledWith('k', '1', 'EX', 30);
  });

  it('reports a miss as null', async () => {
    await expect(cache.get('absent')).resolves.toBeNull();
  });

  it('refuses to store undefined', async () => {
    // `JSON.stringify(undefined)` is `undefined`, which ioredis would reject at
    // the wire — better to decline than to throw from inside a cache write.
    await expect(cache.set('k', undefined)).resolves.toBe(false);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('deletes with UNLINK so a large value cannot stall the server', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await expect(cache.del('a', 'b')).resolves.toBe(2);
    expect(client.unlink).toHaveBeenCalledWith('a', 'b');
  });

  it('does not issue a delete with no keys', async () => {
    // `UNLINK` with no arguments is a syntax error at the server.
    await expect(cache.del()).resolves.toBe(0);
    expect(client.unlink).not.toHaveBeenCalled();
  });
});

describe('CacheService — read-through', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService(fakeRedis(), { defaultTtl: 300 });
  });

  it('runs the producer once and serves the rest from the cache', async () => {
    const producer = jest.fn().mockResolvedValue({ total: 1 });

    await expect(cache.wrap('k', producer)).resolves.toEqual({ total: 1 });
    await expect(cache.wrap('k', producer)).resolves.toEqual({ total: 1 });

    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('treats a cached falsy value as a hit', async () => {
    // `if (hit)` instead of `if (hit !== null)` would re-query the database on
    // every request for an empty list — the exact shape that is cached most.
    for (const falsy of [0, false, '', []]) {
      const producer = jest.fn().mockResolvedValue(falsy);
      await cache.wrap(`k:${JSON.stringify(falsy)}`, producer);
      await cache.wrap(`k:${JSON.stringify(falsy)}`, producer);
      expect(producer).toHaveBeenCalledTimes(1);
    }
  });

  it('does not cache an absent result', async () => {
    // Caching a `null` lookup would hold a 404 for the whole TTL after the
    // record is created.
    const producer = jest.fn().mockResolvedValue(null);
    await cache.wrap('k', producer);
    await cache.wrap('k', producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('propagates a failing producer instead of masking it', async () => {
    // A failed database read is a real error. Swallowing it here would turn a
    // 500 into a silent empty response.
    const producer = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(cache.wrap('k', producer)).rejects.toThrow('db down');
  });
});

describe('CacheService — prefix invalidation', () => {
  let client;
  let cache;

  beforeEach(async () => {
    client = fakeRedis();
    cache = new CacheService(client);
    await cache.set(`${NAMESPACE}:doctors`, 1);
    await cache.set(`${NAMESPACE}:doctors:page=1`, 1);
    await cache.set(`${NAMESPACE}:doctors:page=2`, 1);
    await cache.set(`${NAMESPACE}:doctors:page=3&ward=ICU`, 1);
    await cache.set(`${NAMESPACE}:patients:page=1`, 1);
  });

  it('drops every key under the prefix', async () => {
    // The reason invalidation is by prefix: the list endpoint's keys depend on
    // arbitrary query strings, so they cannot be enumerated at write time.
    await expect(cache.invalidate('doctors')).resolves.toBe(4);
    expect([...client.store.keys()]).toEqual([`${NAMESPACE}:patients:page=1`]);
  });

  it('follows the cursor to the end instead of stopping at the first batch', async () => {
    // SCAN returns "some" keys per call. Treating the first reply as the whole
    // answer leaves most of the stale entries in place — and the bug hides,
    // because small test datasets fit in one batch.
    await cache.invalidate('doctors');
    expect(client.scan.mock.calls.length).toBeGreaterThan(1);
  });

  it('never uses KEYS', async () => {
    // `KEYS *` blocks the single Redis thread for the length of the scan; at
    // 10k users that is a visible stall on every write.
    await cache.invalidate('doctors');
    expect(client.keys).not.toHaveBeenCalled();
  });

  it('leaves neighbouring namespaces alone', async () => {
    await cache.invalidate('patients');
    expect(client.store.has(`${NAMESPACE}:doctors:page=1`)).toBe(true);
  });
});

describe('CacheService — the login throttle counter', () => {
  it('sets the expiry on first increment only', async () => {
    // Re-arming the TTL on every attempt would let an attacker hold the window
    // open indefinitely by keeping the counter warm.
    const client = fakeRedis();
    const cache = new CacheService(client);

    await expect(cache.increment('attempts', 900)).resolves.toBe(1);
    await expect(cache.increment('attempts', 900)).resolves.toBe(2);

    expect(client.expire).toHaveBeenCalledTimes(1);
    expect(client.expire).toHaveBeenCalledWith('attempts', 900);
  });

  it('marks and detects a key without a payload', async () => {
    const cache = new CacheService(fakeRedis());
    await expect(cache.has('jti')).resolves.toBe(false);
    await expect(cache.mark('jti', 60)).resolves.toBe(true);
    await expect(cache.has('jti')).resolves.toBe(true);
  });

  it('refuses to mark a key with an expiry in the past', async () => {
    // `SET ... EX 0` is an error, and a negative TTL means the token it stands
    // for has already expired — there is nothing left to revoke.
    const client = fakeRedis();
    const cache = new CacheService(client);
    await expect(cache.mark('jti', 0)).resolves.toBe(false);
    await expect(cache.mark('jti', -30)).resolves.toBe(false);
    expect(client.set).not.toHaveBeenCalled();
  });
});

describe('CacheService — when Redis fails mid-request', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService(brokenRedis());
  });

  it('degrades every operation to its miss value instead of throwing', async () => {
    // One rejected command must not become a 500 on an endpoint that could have
    // answered from the database.
    await expect(cache.get('k')).resolves.toBeNull();
    await expect(cache.set('k', 1)).resolves.toBe(false);
    await expect(cache.del('k')).resolves.toBe(0);
    await expect(cache.invalidate('doctors')).resolves.toBe(0);
    await expect(cache.increment('k', 60)).resolves.toBeNull();
    await expect(cache.has('k')).resolves.toBe(false);
    await expect(cache.mark('k', 60)).resolves.toBe(false);
  });

  it('falls back to the producer when the read fails', async () => {
    const producer = jest.fn().mockResolvedValue('fresh');
    await expect(cache.wrap('k', producer)).resolves.toBe('fresh');
  });

  it('fails closed on a corrupt entry rather than propagating a parse error', async () => {
    // Anything can write to a shared Redis. A half-written value must read as a
    // miss, not as a `SyntaxError` thrown from inside a controller.
    const client = fakeRedis();
    client.store.set('k', '{"truncated":');
    await expect(new CacheService(client).get('k')).resolves.toBeNull();
  });
});
