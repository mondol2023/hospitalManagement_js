'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');

/**
 * Pre-aggregated metric snapshots.
 *
 * The original analytics controller ran live `countDocuments()` across several
 * collections on every dashboard load. At 10k users with dashboards polling,
 * that is a steady stream of full-collection counts. Snapshots written on a
 * schedule (or on demand by an admin) let the dashboard read one small,
 * well-indexed collection instead.
 *
 * `Analytics.find(req.query)` in the original controller also passed raw user
 * query input straight into the filter — a trivial NoSQL injection vector.
 */
const analyticsSchema = new mongoose.Schema(
  {
    metric: { type: String, required: true, trim: true },
    value: { type: Number, required: true },
    dimensions: { type: Map, of: String, default: undefined },
    /** Bucket granularity this snapshot represents. */
    period: {
      type: String,
      enum: ['hourly', 'daily', 'weekly', 'monthly'],
      default: 'daily',
    },
    recordedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

analyticsSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// Time-series read: one metric over a date range.
analyticsSchema.index({ metric: 1, period: 1, recordedAt: -1 });
// Idempotent snapshot writes — re-running a rollup overwrites its bucket.
analyticsSchema.index({ metric: 1, period: 1, recordedAt: 1 }, { unique: true });

module.exports = mongoose.model('Analytics', analyticsSchema);
