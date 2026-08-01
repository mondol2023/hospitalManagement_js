'use strict';

const { z, dateValue } = require('./common');
const { METRICS, PERIODS } = require('../services/analyticsService');

/**
 * Reporting.
 *
 * The metric name is a closed vocabulary, checked here and again in the service.
 * The original controller passed `req.query` straight into `Analytics.find()`,
 * which let a caller shape the filter — and therefore the collection scan —
 * themselves. A metric that is not in the catalogue is a 422 before it reaches
 * a query planner.
 */

const metricName = z.enum(Object.values(METRICS));
const period = z.enum([...PERIODS]);

const windowFields = {
  period: period.optional(),
  from: dateValue.optional(),
  to: dateValue.optional(),
};

const orderedRange = (schema) =>
  schema.refine((value) => !value.from || !value.to || value.from < value.to, {
    message: 'from must be before to',
    path: ['from'],
  });

const window = orderedRange(z.object(windowFields));

const dashboard = { query: z.object({ period: period.optional() }) };

const series = {
  params: z.object({ metric: metricName }),
  query: window,
};

/**
 * Comma-separated so a multi-line chart stays one cacheable GET. The service
 * caps the list at eight; the schema says the same so an oversized request costs
 * nothing.
 */
const compare = {
  query: orderedRange(
    z.object({
      ...windowFields,
      metrics: z
        .string()
        .trim()
        .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
        .pipe(z.array(metricName).min(1).max(8)),
    })
  ),
};

const refresh = { body: z.object({ period: period.optional() }) };

const record = {
  body: z.object({
    metric: metricName,
    value: z.coerce.number().finite(),
    period: period.optional(),
    at: dateValue.optional(),
    dimensions: z.record(z.string().max(200)).optional(),
  }),
};

const purge = {
  body: z.object({
    period: period.optional(),
    olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
  }),
};

module.exports = { dashboard, series, compare, refresh, record, purge };
