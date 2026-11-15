'use strict';

const ApiError = require('../../utils/ApiError');

// UTC on purpose: a bucket must not shift when a host changes region. Weeks start on Monday.
function bucketStart(date, period) {
  const at = new Date(date);
  if (Number.isNaN(at.getTime())) throw ApiError.badRequest('Invalid date');

  const [y, m, d] = [at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()];

  switch (period) {
    case 'hourly':
      return new Date(Date.UTC(y, m, d, at.getUTCHours()));
    case 'weekly': {
      const start = new Date(Date.UTC(y, m, d));
      // getUTCDay(): 0 = Sunday, which is 6 days into a Monday-first week.
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      return start;
    }
    case 'monthly':
      return new Date(Date.UTC(y, m, 1));
    case 'daily':
    default:
      return new Date(Date.UTC(y, m, d));
  }
}

// Half-open `[start, end)`: the range the bucket's counts cover.
function bucketRange(start, period) {
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

function defaultWindowStart(end, period) {
  const spans = { hourly: 2, daily: 30, weekly: 180, monthly: 730 };
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (spans[period] || 30));
  return start;
}

// Zero capacity is 0%, not a division by zero.
function rate(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

module.exports = { bucketStart, bucketRange, defaultWindowStart, rate };
