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
const {
  ROLES,
  APPOINTMENT_STATUS,
  BED_STATUS,
  BILL_STATUS,
} = require('../utils/constants');
const cacheService = require('./cacheService');
const { buildKey } = require('./cacheService');

const CACHE_PREFIX = 'analytics';
/** Tiles are read far more often than the rollup writes them. */
const TILE_TTL = 60;
const SERIES_TTL = 300;
const LIVE_TTL = 30;
const MAX_SERIES_POINTS = 1000;

const PERIODS = Object.freeze(['hourly', 'daily', 'weekly', 'monthly']);

/**
 * The metric catalogue.
 *
 * Every name the system can write or read lives here. The original controller
 * passed `req.query` straight into `Analytics.find()`, so a caller could shape
 * the filter themselves; keeping the vocabulary closed means a read can only ever
 * name a metric this service actually produces.
 */
const METRICS = Object.freeze({
  PATIENTS_TOTAL: 'patients.total',
  PATIENTS_ADMITTED: 'patients.admitted',
  APPOINTMENTS_BOOKED: 'appointments.booked',
  APPOINTMENTS_PENDING: 'appointments.pending',
  APPOINTMENTS_COMPLETED: 'appointments.completed',
  APPOINTMENTS_NO_SHOW: 'appointments.noShow',
  BEDS_TOTAL: 'beds.total',
  BEDS_OCCUPIED: 'beds.occupied',
  BEDS_AVAILABLE: 'beds.available',
  BEDS_OCCUPANCY_RATE: 'beds.occupancyRate',
  EMERGENCIES_OPEN: 'emergencies.open',
  CARE_ATTENTION_OPEN: 'care.attentionOpen',
  INVENTORY_LOW_STOCK: 'inventory.lowStock',
  REVENUE_BILLED_CENTS: 'revenue.billedCents',
  REVENUE_COLLECTED_CENTS: 'revenue.collectedCents',
  REVENUE_OUTSTANDING_CENTS: 'revenue.outstandingCents',
  STAFF_ACTIVE: 'staff.active',
});

const METRIC_VALUES = Object.freeze(Object.values(METRICS));

/** Money is management information, not floor information. */
const FINANCIAL_METRICS = Object.freeze([
  METRICS.REVENUE_BILLED_CENTS,
  METRICS.REVENUE_COLLECTED_CENTS,
  METRICS.REVENUE_OUTSTANDING_CENTS,
]);

const FINANCE_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT]);

/**
 * Hospital-wide reporting.
 *
 * The point of this service is what it does *not* do on a dashboard load. The
 * original analytics controller ran live `countDocuments()` across half the
 * collections every time a dashboard rendered; with a few hundred staff leaving
 * a dashboard open on a polling interval that is a permanent background scan of
 * the entire database. Here the counting happens once per bucket in `runRollup`,
 * and the dashboard reads back a handful of pre-aggregated points from one small,
 * well-indexed collection.
 *
 * Two consequences follow, and both are deliberate:
 *
 *  - **Tiles are as fresh as the last rollup, and say so.** Each tile carries its
 *    own `recordedAt` and an `ageMinutes`, so a stale board is visibly stale
 *    rather than quietly wrong. A metric that has never been rolled up comes back
 *    with a `null` value instead of a fabricated zero — "no data" and "zero" are
 *    different answers, and a bed board showing zero occupancy because a job
 *    never ran is the kind of wrong that gets acted on.
 *  - **Anything that must be true *now* is not a tile.** Open emergencies and the
 *    ward occupancy board are read live through `liveBoard`, on a short cache,
 *    because a snapshot of a resuscitation call from an hour ago is not
 *    information. Everything that is a trend rather than a state is a snapshot.
 *
 * Access is staff-only throughout, with financial metrics filtered out for
 * everyone outside finance — a ward sister gets occupancy and admissions; she
 * does not get the day's takings.
 */
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
    this.appointments = appointments;
    this.beds = beds;
    this.bills = bills;
    this.careLogs = careLogs;
    this.emergencies = emergencies;
    this.medicines = medicines;
    this.patients = patients;
    this.users = users;
    this.cache = cache;
  }

  /** The metric vocabulary, so a client can build its own board. */
  catalogue(actor) {
    this._assertStaff(actor);
    return {
      periods: [...PERIODS],
      metrics: this._visibleMetrics(actor).map((metric) => ({
        metric,
        financial: FINANCIAL_METRICS.includes(metric),
      })),
    };
  }

  // --- Reads ----------------------------------------------------------------

  /**
   * The dashboard tiles for whoever is asking.
   *
   * Cached per visibility tier rather than per user: two nurses see byte-identical
   * boards, and keying the cache by user id would multiply one cheap entry by the
   * size of the staff list.
   */
  async dashboard(actor, { period = 'daily' } = {}) {
    this._assertStaff(actor);
    this._assertPeriod(period);

    const metrics = this._visibleMetrics(actor);
    const tier = this._tierOf(actor);
    const key = buildKey(CACHE_PREFIX, { view: 'dashboard', period, tier });

    return this.cache.wrap(key, () => this._buildTiles(metrics, period), TILE_TTL);
  }

  /**
   * One metric over time.
   *
   * The range is clamped rather than rejected: a chart asking for five years of
   * hourly points is a UI bug, and returning the most recent window it can
   * actually draw is more useful than an error.
   */
  async series(metric, { period = 'daily', from, to } = {}, actor) {
    this._assertStaff(actor);
    this._assertPeriod(period);
    this._assertMetricVisible(metric, actor);

    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : this._defaultWindowStart(end, period);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid date range');
    }
    if (start >= end) throw ApiError.badRequest('`from` must be before `to`');

    const key = buildKey(CACHE_PREFIX, {
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

  /**
   * Several series at once, for a multi-line chart.
   *
   * One call so a six-line chart is six parallel reads on the server rather than
   * six round trips from the browser.
   */
  async compare(metrics, options = {}, actor) {
    this._assertStaff(actor);
    if (!Array.isArray(metrics) || !metrics.length) {
      throw ApiError.badRequest('At least one metric is required');
    }
    if (metrics.length > 8) throw ApiError.badRequest('At most 8 metrics can be compared');

    return Promise.all(metrics.map((metric) => this.series(metric, options, actor)));
  }

  /**
   * State that has to be true *now*.
   *
   * Everything here is a cheap indexed count or a single grouped aggregation, and
   * the short cache stops a wall-mounted board polling every few seconds from
   * turning into sustained load.
   */
  async liveBoard(actor) {
    this._assertStaff(actor);

    return this.cache.wrap(
      buildKey(CACHE_PREFIX, { view: 'live' }),
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
          wards: this._shapeOccupancy(occupancy).wards,
        };
      },
      LIVE_TTL
    );
  }

  /** The occupancy board on its own — the ward whiteboard, in JSON. */
  async wardOccupancy(actor) {
    this._assertStaff(actor);
    return this.cache.wrap(
      buildKey(CACHE_PREFIX, { view: 'occupancy' }),
      async () => {
        const rows = await this.beds.occupancyByWard();
        return { generatedAt: new Date(), ...this._shapeOccupancy(rows) };
      },
      LIVE_TTL
    );
  }

  // --- Writes ---------------------------------------------------------------

  /**
   * Collects every metric and writes one point per bucket.
   *
   * Safe to run twice. The repository upserts on `{ metric, period, recordedAt }`
   * and the bucket start is derived from the clock, so a retried job, an overlap
   * between a cron and a manual refresh, or two application instances both firing
   * their scheduler all converge on the same row instead of duplicating the
   * series. That is why the job holds no state of its own about what it has
   * already written.
   *
   * Collection failures are contained per metric group: a broken pharmacy index
   * should cost the dashboard its stock tile, not the whole rollup.
   */
  async runRollup({ period = 'daily', at = new Date() } = {}) {
    this._assertPeriod(period);
    const recordedAt = this._bucketStart(at, period);
    const { start, end } = this._bucketRange(recordedAt, period);

    const groups = await Promise.allSettled([
      this._collectCensus(),
      this._collectActivity(start, end),
      this._collectCapacity(),
      this._collectOperations(),
      this._collectRevenue(start, end),
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

  /**
   * An operator forcing a refresh.
   *
   * Separated from `runRollup` so the scheduled job stays actor-free — a cron tick
   * has no user, and threading a fake one through it just to satisfy an
   * authorisation check would be a lie in the audit trail.
   */
  async refresh(actor, { period = 'daily' } = {}) {
    this._assertManagement(actor);
    logger.info('Analytics refresh requested', { by: String(actor.id), period });
    return this.runRollup({ period });
  }

  /**
   * Records a metric this service does not collect itself.
   *
   * Deliberately narrow: the name still has to be in the catalogue. An open
   * `record(anything)` is how a metrics collection turns into an unbounded write
   * target for whatever the client feels like naming.
   */
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
      recordedAt: this._bucketStart(at, period),
      dimensions,
    });
    await this._invalidate();
    return saved;
  }

  /**
   * Drops points older than the retention window.
   *
   * Hourly buckets accumulate at 24 rows per metric per day and nobody charts
   * last spring by the hour; without this the collection grows forever to hold
   * detail no one reads.
   */
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

  // --- collectors -----------------------------------------------------------

  /** @private headcount: who is in the building, and on the books. */
  async _collectCensus() {
    const [total, admitted, staffRows] = await Promise.all([
      this.patients.count({}),
      this.patients.count({ isAdmitted: true }),
      this.users.countByRole(),
    ]);

    const byRole = {};
    let staffActive = 0;
    for (const row of staffRows) {
      byRole[row._id] = String(row.count);
      if (row._id !== ROLES.PATIENT) staffActive += row.count;
    }

    return [
      { metric: METRICS.PATIENTS_TOTAL, value: total },
      { metric: METRICS.PATIENTS_ADMITTED, value: admitted },
      { metric: METRICS.STAFF_ACTIVE, value: staffActive, dimensions: byRole },
    ];
  }

  /**
   * @private appointment throughput inside the bucket.
   *
   * Booked counts by when the appointment *starts*, not when it was created —
   * "what did the clinic do that day" is the question, and a next-month booking
   * taken today belongs to next month.
   */
  async _collectActivity(start, end) {
    const window = { startsAt: { $gte: start, $lt: end } };
    const [booked, pending, completed, noShow] = await Promise.all([
      this.appointments.count(window),
      this.appointments.count({ ...window, status: APPOINTMENT_STATUS.PENDING }),
      this.appointments.count({ ...window, status: APPOINTMENT_STATUS.COMPLETED }),
      this.appointments.count({ ...window, status: APPOINTMENT_STATUS.NO_SHOW }),
    ]);

    return [
      { metric: METRICS.APPOINTMENTS_BOOKED, value: booked },
      { metric: METRICS.APPOINTMENTS_PENDING, value: pending },
      { metric: METRICS.APPOINTMENTS_COMPLETED, value: completed },
      { metric: METRICS.APPOINTMENTS_NO_SHOW, value: noShow },
    ];
  }

  /** @private bed capacity, with the per-ward split carried as dimensions. */
  async _collectCapacity() {
    const rows = await this.beds.occupancyByWard();
    const shaped = this._shapeOccupancy(rows);

    const dimensions = {};
    for (const ward of shaped.wards) {
      dimensions[ward.ward] = `${ward.occupied}/${ward.total}`;
    }

    return [
      { metric: METRICS.BEDS_TOTAL, value: shaped.total },
      { metric: METRICS.BEDS_OCCUPIED, value: shaped.occupied, dimensions },
      { metric: METRICS.BEDS_AVAILABLE, value: shaped.available },
      { metric: METRICS.BEDS_OCCUPANCY_RATE, value: shaped.occupancyRate },
    ];
  }

  /** @private the safety signals — what is open right now, snapshotted for trend. */
  async _collectOperations() {
    const [openEmergencies, attention, lowStock] = await Promise.all([
      this.emergencies.countOpen(),
      this.careLogs.countUnacknowledged(),
      this.medicines.lowStock(),
    ]);

    return [
      { metric: METRICS.EMERGENCIES_OPEN, value: openEmergencies },
      { metric: METRICS.CARE_ATTENTION_OPEN, value: attention },
      { metric: METRICS.INVENTORY_LOW_STOCK, value: lowStock.length },
    ];
  }

  /**
   * @private money for the bucket, in minor units.
   *
   * Outstanding is derived as billed minus collected rather than counted
   * separately, so the three figures cannot contradict each other. Voided bills
   * are already excluded by the repository — a cancelled invoice was never
   * revenue.
   */
  async _collectRevenue(start, end) {
    const rows = await this.bills.revenueBetween(start, end);

    let billed = 0;
    let collected = 0;
    const dimensions = {};
    for (const row of rows) {
      billed += row.billedCents;
      collected += row.collectedCents;
      dimensions[row._id || BILL_STATUS.UNPAID] = String(row.count);
    }

    return [
      { metric: METRICS.REVENUE_BILLED_CENTS, value: billed, dimensions },
      { metric: METRICS.REVENUE_COLLECTED_CENTS, value: collected },
      { metric: METRICS.REVENUE_OUTSTANDING_CENTS, value: Math.max(billed - collected, 0) },
    ];
  }

  // --- internals ------------------------------------------------------------

  /** @private */
  _assertStaff(actor) {
    if (!actor || !accessPolicy.isStaff(actor.role)) {
      throw ApiError.forbidden('Reporting is available to hospital staff only');
    }
  }

  /** @private writing and purging are management acts, not floor ones. */
  _assertManagement(actor) {
    if (!actor || !accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only an administrator or manager can change reporting data');
    }
  }

  /** @private */
  _assertPeriod(period) {
    if (!PERIODS.includes(period)) {
      throw ApiError.badRequest(`Period must be one of: ${PERIODS.join(', ')}`);
    }
  }

  /** @private */
  _assertMetricVisible(metric, actor) {
    if (!METRIC_VALUES.includes(metric)) throw ApiError.badRequest('Unknown metric');
    if (FINANCIAL_METRICS.includes(metric) && !this._canSeeMoney(actor)) {
      throw ApiError.forbidden('Financial reporting is restricted');
    }
  }

  /** @private */
  _canSeeMoney(actor) {
    return Boolean(actor) && FINANCE_ROLES.includes(actor.role);
  }

  /** @private cache dimension — two tiers, so two cached boards, not one per user. */
  _tierOf(actor) {
    return this._canSeeMoney(actor) ? 'finance' : 'staff';
  }

  /** @private */
  _visibleMetrics(actor) {
    if (this._canSeeMoney(actor)) return METRIC_VALUES;
    return METRIC_VALUES.filter((metric) => !FINANCIAL_METRICS.includes(metric));
  }

  /**
   * @private assembles the tiles from the newest snapshot of each metric.
   *
   * A metric with no snapshot yet returns `null` rather than `0`, and every tile
   * carries how old it is, because a dashboard that cannot distinguish "nothing
   * happened" from "the job stopped running" is worse than no dashboard.
   */
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
      /** Oldest tile on the board — one number that says whether to trust it. */
      stalestMinutes: ages.length ? Math.max(...ages) : null,
      missing: tiles.filter((tile) => tile.value === null).map((tile) => tile.metric),
      tiles,
    };
  }

  /** @private folds the ward aggregation into totals plus a per-ward breakdown. */
  _shapeOccupancy(rows = []) {
    let total = 0;
    let occupied = 0;
    let available = 0;

    const wards = rows.map((row) => {
      const byStatus = {};
      for (const entry of row.byStatus || []) byStatus[entry.status] = entry.count;

      const wardOccupied = byStatus[BED_STATUS.OCCUPIED] || 0;
      const wardAvailable = byStatus[BED_STATUS.AVAILABLE] || 0;

      total += row.total;
      occupied += wardOccupied;
      available += wardAvailable;

      return {
        ward: row._id,
        total: row.total,
        occupied: wardOccupied,
        available: wardAvailable,
        byStatus,
        occupancyRate: this._rate(wardOccupied, row.total),
      };
    });

    return { total, occupied, available, occupancyRate: this._rate(occupied, total), wards };
  }

  /** @private percentage to one decimal; zero capacity is 0%, not a division by zero. */
  _rate(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 1000) / 10;
  }

  /**
   * @private start of the bucket containing `date`, in UTC.
   *
   * UTC on purpose: the server's local zone is an accident of deployment, and a
   * daily bucket that shifts when a host moves region silently rewrites history.
   * Weeks start on Monday, which is what a hospital rota means by "this week".
   */
  _bucketStart(date, period) {
    const at = new Date(date);
    if (Number.isNaN(at.getTime())) throw ApiError.badRequest('Invalid date');

    const [y, m, d] = [at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()];

    switch (period) {
      case 'hourly':
        return new Date(Date.UTC(y, m, d, at.getUTCHours()));
      case 'weekly': {
        const start = new Date(Date.UTC(y, m, d));
        // getUTCDay(): 0 = Sunday, which is 6 days into a Monday-first week.
        const offset = (start.getUTCDay() + 6) % 7;
        start.setUTCDate(start.getUTCDate() - offset);
        return start;
      }
      case 'monthly':
        return new Date(Date.UTC(y, m, 1));
      case 'daily':
      default:
        return new Date(Date.UTC(y, m, d));
    }
  }

  /** @private half-open `[start, end)` — the range the bucket's counts cover. */
  _bucketRange(start, period) {
    const end = new Date(start);
    switch (period) {
      case 'hourly':
        end.setUTCHours(end.getUTCHours() + 1);
        break;
      case 'weekly':
        end.setUTCDate(end.getUTCDate() + 7);
        break;
      case 'monthly':
        end.setUTCMonth(end.getUTCMonth() + 1);
        break;
      case 'daily':
      default:
        end.setUTCDate(end.getUTCDate() + 1);
        break;
    }
    return { start, end };
  }

  /** @private how far back a chart looks when the caller does not say. */
  _defaultWindowStart(end, period) {
    const spans = { hourly: 2, daily: 30, weekly: 180, monthly: 730 };
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (spans[period] || 30));
    return start;
  }

  /** @private */
  async _invalidate() {
    try {
      await this.cache.invalidate(CACHE_PREFIX);
    } catch (error) {
      logger.warn('Analytics cache invalidation failed', { error: error.message });
    }
  }
}

module.exports = new AnalyticsService();
module.exports.AnalyticsService = AnalyticsService;
module.exports.METRICS = METRICS;
module.exports.PERIODS = PERIODS;
