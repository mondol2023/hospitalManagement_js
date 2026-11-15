'use strict';

const {
  analyticsRepository,
  appointmentRepository,
  bedRepository,
  billRepository,
  careLogRepository,
  emergencyRepository,
  medicineRepository,
  patientRepository,
  userRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const cacheService = require('./cacheService');
const {
  PERIODS,
  METRICS,
  METRIC_VALUES,
  FINANCIAL_METRICS,
  canSeeMoney,
  visibleMetrics,
} = require('./analytics/metrics');
const { bucketStart, bucketRange, defaultWindowStart } = require('./analytics/buckets');
const { shapeOccupancy } = require('./analytics/occupancy');
const { createCollectors } = require('./analytics/collectors');

const CACHE_PREFIX = 'analytics';
const TILE_TTL = 60;
const SERIES_TTL = 300;
const LIVE_TTL = 30;
const MAX_SERIES_POINTS = 1000;

/** Hospital-wide reporting, staff-only, with money hidden outside finance. */
class AnalyticsService {
  constructor({
    analytics = analyticsRepository,
    appointments = appointmentRepository,
    beds = bedRepository,
    bills = billRepository,
    careLogs = careLogRepository,
    emergencies = emergencyRepository,
    medicines = medicineRepository,
    patients = patientRepository,
    users = userRepository,
    cache = cacheService,
  } = {}) {
    this.analytics = analytics;
    this.beds = beds;
    this.careLogs = careLogs;
    this.emergencies = emergencies;
    this.medicines = medicines;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
    this.collect = createCollectors({
      appointments,
      beds,
      bills,
      careLogs,
      emergencies,
      medicines,
      patients,
      users,
    });
  }

  catalogue(actor) {
    this._assertStaff(actor);
    return {
      periods: [...PERIODS],
      metrics: visibleMetrics(actor).map((metric) => ({
        metric,
        financial: FINANCIAL_METRICS.includes(metric),
      })),
    };
  }

  // Cached per visibility tier, not per user: two nurses see identical boards.
  async dashboard(actor, { period = 'daily' } = {}) {
    this._assertStaff(actor);
    this._assertPeriod(period);

    const tier = canSeeMoney(actor) ? 'finance' : 'staff';
    const key = this.ns.key('', { view: 'dashboard', period, tier });

    return this.cache.wrap(key, () => this._buildTiles(visibleMetrics(actor), period), TILE_TTL);
  }

  // The window is clamped to the newest points, not rejected: an oversized chart request is a UI bug.
  async series(metric, { period = 'daily', from, to } = {}, actor) {
    this._assertStaff(actor);
    this._assertPeriod(period);
    this._assertMetricVisible(metric, actor);

    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : defaultWindowStart(end, period);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid date range');
    }
    if (start >= end) throw ApiError.badRequest('`from` must be before `to`');

    const key = this.ns.key('', {
      view: 'series',
      metric,
      period,
      from: start.toISOString(),
      to: end.toISOString(),
    });

    return this.cache.wrap(
      key,
      async () => {
        const points = await this.analytics.series(metric, { period, from: start, to: end });
        const trimmed = points.slice(-MAX_SERIES_POINTS);
        return {
          metric,
          period,
          from: start,
          to: end,
          truncated: trimmed.length < points.length,
          points: trimmed.map((point) => ({
            recordedAt: point.recordedAt,
            value: point.value,
            dimensions: point.dimensions || undefined,
          })),
        };
      },
      SERIES_TTL
    );
  }

  async compare(metrics, options = {}, actor) {
    this._assertStaff(actor);
    if (!Array.isArray(metrics) || !metrics.length) {
      throw ApiError.badRequest('At least one metric is required');
    }
    if (metrics.length > 8) throw ApiError.badRequest('At most 8 metrics can be compared');

    return Promise.all(metrics.map((metric) => this.series(metric, options, actor)));
  }

  // Live state on a short cache, so a wall-mounted board polling often is not sustained load.
  async liveBoard(actor) {
    this._assertStaff(actor);

    return this.cache.wrap(
      this.ns.key('', { view: 'live' }),
      async () => {
        const [openEmergencies, occupancy, attention, lowStock] = await Promise.all([
          this.emergencies.countOpen(),
          this.beds.occupancyByWard(),
          this.careLogs.countUnacknowledged(),
          this.medicines.lowStock(),
        ]);

        return {
          generatedAt: new Date(),
          openEmergencies,
          unacknowledgedAlerts: attention,
          lowStockCount: lowStock.length,
          wards: shapeOccupancy(occupancy).wards,
        };
      },
      LIVE_TTL
    );
  }

  async wardOccupancy(actor) {
    this._assertStaff(actor);
    return this.cache.wrap(
      this.ns.key('', { view: 'occupancy' }),
      async () => {
        const rows = await this.beds.occupancyByWard();
        return { generatedAt: new Date(), ...shapeOccupancy(rows) };
      },
      LIVE_TTL
    );
  }

  // Idempotent: snapshots upsert on { metric, period, recordedAt }, so retries and
  // overlapping schedulers converge on one row. Collector failures cost a tile, not the rollup.
  async runRollup({ period = 'daily', at = new Date() } = {}) {
    this._assertPeriod(period);
    const recordedAt = bucketStart(at, period);
    const { start, end } = bucketRange(recordedAt, period);

    const groups = await Promise.allSettled([
      this.collect.census(),
      this.collect.activity(start, end),
      this.collect.capacity(),
      this.collect.operations(),
      this.collect.revenue(start, end),
    ]);

    const points = [];
    groups.forEach((group, index) => {
      if (group.status === 'fulfilled') {
        points.push(...group.value);
      } else {
        logger.error('Analytics collector failed', {
          collector: index,
          period,
          error: group.reason && group.reason.message,
        });
      }
    });

    const written = await Promise.allSettled(
      points.map((point) =>
        this.analytics.recordSnapshot({
          metric: point.metric,
          value: point.value,
          period,
          recordedAt,
          dimensions: point.dimensions,
        })
      )
    );

    const failed = written.filter((result) => result.status === 'rejected');
    failed.forEach((result) =>
      logger.error('Snapshot write failed', { period, error: result.reason.message })
    );

    await this._invalidate();

    const summary = {
      period,
      recordedAt,
      collected: points.length,
      written: written.length - failed.length,
      failed: failed.length,
    };
    logger.info('Analytics rollup complete', summary);
    return summary;
  }

  // Separate from `runRollup` so the scheduled job stays actor-free.
  async refresh(actor, { period = 'daily' } = {}) {
    this._assertManagement(actor);
    logger.info('Analytics refresh requested', { by: String(actor.id), period });
    return this.runRollup({ period });
  }

  // Only catalogue names: an open `record(anything)` is an unbounded write target.
  async record({ metric, value, period = 'daily', at = new Date(), dimensions }, actor) {
    this._assertManagement(actor);
    if (!METRIC_VALUES.includes(metric)) throw ApiError.badRequest('Unknown metric');
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw ApiError.badRequest('`value` must be a number');
    }
    this._assertPeriod(period);

    const saved = await this.analytics.recordSnapshot({
      metric,
      value,
      period,
      recordedAt: bucketStart(at, period),
      dimensions,
    });
    await this._invalidate();
    return saved;
  }

  // Hourly buckets pile up at 24 rows per metric per day; nobody charts last spring by the hour.
  async purge({ period = 'hourly', olderThanDays = 90 } = {}, actor) {
    this._assertManagement(actor);
    this._assertPeriod(period);
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
      throw ApiError.badRequest('`olderThanDays` must be a positive whole number');
    }

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.analytics.deleteMany({ period, recordedAt: { $lt: cutoff } });
    const removed = result.deletedCount || 0;

    await this._invalidate();
    logger.info('Analytics purged', { period, cutoff, removed, by: String(actor.id) });
    return { period, cutoff, removed };
  }

  _assertStaff(actor) {
    if (!actor || !accessPolicy.isStaff(actor.role)) {
      throw ApiError.forbidden('Reporting is available to hospital staff only');
    }
  }

  // Writing and purging are management acts, not floor ones.
  _assertManagement(actor) {
    if (!actor || !accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only an administrator or manager can change reporting data');
    }
  }

  _assertPeriod(period) {
    if (!PERIODS.includes(period)) {
      throw ApiError.badRequest(`Period must be one of: ${PERIODS.join(', ')}`);
    }
  }

  _assertMetricVisible(metric, actor) {
    if (!METRIC_VALUES.includes(metric)) throw ApiError.badRequest('Unknown metric');
    if (FINANCIAL_METRICS.includes(metric) && !canSeeMoney(actor)) {
      throw ApiError.forbidden('Financial reporting is restricted');
    }
  }

  // A metric never rolled up is `null`, not 0: "no data" and "zero" must stay distinguishable.
  async _buildTiles(metrics, period) {
    const rows = await this.analytics.latestFor(metrics, period);
    const found = new Map(rows.map((row) => [row._id, row]));
    const now = Date.now();

    const tiles = metrics.map((metric) => {
      const row = found.get(metric);
      if (!row) return { metric, value: null, recordedAt: null, ageMinutes: null };
      return {
        metric,
        value: row.value,
        recordedAt: row.recordedAt,
        ageMinutes: Math.max(Math.round((now - new Date(row.recordedAt).getTime()) / 60000), 0),
      };
    });

    const ages = tiles.map((tile) => tile.ageMinutes).filter((age) => age !== null);

    return {
      period,
      generatedAt: new Date(),
      stalestMinutes: ages.length ? Math.max(...ages) : null,
      missing: tiles.filter((tile) => tile.value === null).map((tile) => tile.metric),
      tiles,
    };
  }

  async _invalidate() {
    try {
      await this.ns.invalidate();
    } catch (error) {
      logger.warn('Analytics cache invalidation failed', { error: error.message });
    }
  }
}

module.exports = new AnalyticsService();
module.exports.AnalyticsService = AnalyticsService;
module.exports.METRICS = METRICS;
module.exports.PERIODS = PERIODS;
