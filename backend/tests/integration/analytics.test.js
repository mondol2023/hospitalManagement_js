'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient, createBed } = require('../helpers/factories');
const { Bed, Analytics } = require('../../src/models');
const { ROLES, BED_STATUS } = require('../../src/utils/constants');

// Characterization suite: pins reporting behaviour so the service can be split safely.

const get = (path, actor) => api().get(url(path)).set(actor.headers);
const post = (path, actor, body = {}) => api().post(url(path)).set(actor.headers).send(body);

describe('analytics — access', () => {
  it('refuses patients entirely', async () => {
    const patient = await createActor(ROLES.PATIENT);
    expectError(await get('/analytics/catalogue', patient), 403);
  });

  it('hides financial metrics from the floor and shows them to finance', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const accountant = await createActor(ROLES.ACCOUNTANT);

    const floor = expectOk(await get('/analytics/catalogue', nurse));
    const finance = expectOk(await get('/analytics/catalogue', accountant));

    expect(floor.metrics.some((m) => m.financial)).toBe(false);
    expect(finance.metrics.some((m) => m.financial)).toBe(true);
    expect(floor.periods).toEqual(['hourly', 'daily', 'weekly', 'monthly']);
  });

  it('forbids a nurse from reading a financial series', async () => {
    const nurse = await createActor(ROLES.NURSE);
    expectError(await get('/analytics/series/revenue.billedCents', nurse), 403);
  });

  it('keeps writing and purging to admins', async () => {
    const nurse = await createActor(ROLES.NURSE);
    expectError(await post('/analytics/refresh', nurse), 403);
    expectError(await post('/analytics/metrics', nurse, { metric: 'staff.active', value: 1 }), 403);
    expectError(await post('/analytics/purge', nurse), 403);
  });

  it('rejects a metric outside the catalogue', async () => {
    const admin = await createActor(ROLES.ADMIN);
    expectError(await get('/analytics/series/patients.secret', admin), 422);
  });
});

describe('analytics — dashboard tiles', () => {
  it('reports null, not zero, for a metric that has never been rolled up', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const board = expectOk(await get('/analytics/dashboard', nurse));

    expect(board.tiles.length).toBeGreaterThan(0);
    expect(board.tiles.every((tile) => tile.value === null)).toBe(true);
    expect(board.missing).toHaveLength(board.tiles.length);
    expect(board.stalestMinutes).toBeNull();
  });

  it('fills tiles after a rollup and keeps money off the staff tier', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);
    const accountant = await createActor(ROLES.ACCOUNTANT);
    await createAdmittedPatient({ nurses: [nurse] });

    const summary = expectOk(await post('/analytics/refresh', admin, { period: 'daily' }));
    expect(summary.failed).toBe(0);
    expect(summary.written).toBe(summary.collected);

    const staff = expectOk(await get('/analytics/dashboard', nurse));
    const finance = expectOk(await get('/analytics/dashboard', accountant));

    const admitted = staff.tiles.find((t) => t.metric === 'patients.admitted');
    expect(admitted.value).toBe(1);
    // Age counts from the bucket start, not from when the rollup ran.
    expect(admitted.ageMinutes).toBeGreaterThanOrEqual(0);
    expect(staff.tiles.some((t) => t.metric.startsWith('revenue.'))).toBe(false);
    expect(finance.tiles.some((t) => t.metric === 'revenue.billedCents')).toBe(true);
    expect(staff.missing).toEqual([]);
  });

  it('is idempotent: a second rollup in the same bucket overwrites, not duplicates', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await post('/analytics/refresh', admin);
    const before = await Analytics.countDocuments({});
    await post('/analytics/refresh', admin);
    expect(await Analytics.countDocuments({})).toBe(before);
  });
});

describe('analytics — recording, series and purge', () => {
  it('buckets a weekly point to the Monday of its week (UTC)', async () => {
    const admin = await createActor(ROLES.ADMIN);
    // 2026-11-18 is a Wednesday.
    const saved = expectOk(
      await post('/analytics/metrics', admin, {
        metric: 'staff.active',
        value: 7,
        period: 'weekly',
        at: '2026-11-18T10:30:00Z',
      })
    );
    expect(new Date(saved.recordedAt).toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('buckets hourly and monthly points', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const hourly = expectOk(
      await post('/analytics/metrics', admin, {
        metric: 'staff.active',
        value: 1,
        period: 'hourly',
        at: '2026-11-18T10:45:00Z',
      })
    );
    const monthly = expectOk(
      await post('/analytics/metrics', admin, {
        metric: 'staff.active',
        value: 1,
        period: 'monthly',
        at: '2026-11-18T10:45:00Z',
      })
    );
    expect(new Date(hourly.recordedAt).toISOString()).toBe('2026-11-18T10:00:00.000Z');
    expect(new Date(monthly.recordedAt).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('returns a recorded series, trimmed to the requested window', async () => {
    const admin = await createActor(ROLES.ADMIN);
    for (const day of ['10', '11', '12']) {
      await post('/analytics/metrics', admin, {
        metric: 'patients.total',
        value: Number(day),
        at: `2026-11-${day}T08:00:00Z`,
      });
    }

    const result = expectOk(
      await get(
        '/analytics/series/patients.total?from=2026-11-11T00:00:00Z&to=2026-11-13T00:00:00Z',
        admin
      )
    );
    expect(result.truncated).toBe(false);
    expect(result.points.map((p) => p.value)).toEqual([11, 12]);
  });

  it('compares several series in one call and caps the list at eight', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const ok = expectOk(await get('/analytics/compare?metrics=patients.total,beds.total', admin));
    expect(ok.map((s) => s.metric)).toEqual(['patients.total', 'beds.total']);

    const nine = Array(9).fill('patients.total').join(',');
    expectError(await get(`/analytics/compare?metrics=${nine}`, admin), 422);
  });

  it('purges points older than the window and reports how many', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await post('/analytics/metrics', admin, {
      metric: 'staff.active',
      value: 1,
      period: 'hourly',
      at: '2020-01-01T00:00:00Z',
    });
    const result = expectOk(await post('/analytics/purge', admin, { period: 'hourly', olderThanDays: 30 }));
    expect(result.removed).toBe(1);
  });
});

describe('analytics — live board', () => {
  it('shapes ward occupancy with rates and totals', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const patient = await createAdmittedPatient();
    await createBed({ ward: 'ICU', status: BED_STATUS.OCCUPIED, patient: patient.profile._id });
    await createBed({ ward: 'ICU' });
    await createBed({ ward: 'ICU' });
    await createBed({ ward: 'ER' });

    const board = expectOk(await get('/analytics/occupancy', nurse));
    expect(board.total).toBe(4);
    expect(board.occupied).toBe(1);
    expect(board.occupancyRate).toBe(25);

    const icu = board.wards.find((w) => w.ward === 'ICU');
    expect(icu).toMatchObject({ total: 3, occupied: 1, available: 2, occupancyRate: 33.3 });
    expect(await Bed.countDocuments({})).toBe(4);
  });

  it('exposes live counters', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const live = expectOk(await get('/analytics/live', nurse));
    expect(live).toMatchObject({ openEmergencies: 0, unacknowledgedAlerts: 0, lowStockCount: 0 });
    expect(Array.isArray(live.wards)).toBe(true);
  });

  it('carries ward names into the rollup dimensions', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createBed({ ward: 'ICU' });
    await post('/analytics/refresh', admin);

    const point = await Analytics.findOne({ metric: 'beds.occupied' }).lean();
    expect(Object.keys(point.dimensions)).toEqual(['ICU']);
  });
});
