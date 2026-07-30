'use strict';

const BaseRepository = require('./BaseRepository');
const { Analytics } = require('../models');

class AnalyticsRepository extends BaseRepository {
  constructor() {
    super(Analytics, { sortableFields: ['recordedAt', 'metric'], defaultSort: { recordedAt: -1 } });
  }

  /**
   * Writes one point of a rollup.
   *
   * Upserting on the unique `{ metric, period, recordedAt }` key makes the whole
   * job idempotent: a retried or double-scheduled rollup overwrites its own
   * bucket instead of duplicating it, so the series stays correct without the job
   * needing to track what it already wrote.
   */
  recordSnapshot({ metric, value, period, recordedAt, dimensions }) {
    return this.model
      .findOneAndUpdate(
        { metric, period, recordedAt },
        { $set: { value, dimensions: dimensions || {} } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      )
      .lean()
      .exec();
  }

  /** A time series for one metric — ascending, because charts read left to right. */
  series(metric, { period, from, to } = {}) {
    const filter = { metric };
    if (period) filter.period = period;
    if (from || to) {
      filter.recordedAt = {};
      if (from) filter.recordedAt.$gte = from;
      if (to) filter.recordedAt.$lt = to;
    }
    return this.model.find(filter).sort({ recordedAt: 1 }).lean().exec();
  }

  /** Newest point per metric, for the dashboard tiles. */
  latestFor(metrics, period) {
    return this.aggregate([
      { $match: { metric: { $in: metrics }, period } },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: '$metric', value: { $first: '$value' }, recordedAt: { $first: '$recordedAt' } } },
    ]);
  }
}

module.exports = new AnalyticsRepository();
