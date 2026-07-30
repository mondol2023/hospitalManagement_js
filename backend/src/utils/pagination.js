'use strict';

const { PAGINATION } = require('./constants');

/**
 * Pagination is not optional at 10k users: the original `Model.find()` calls
 * would stream every document in a collection into memory on each request. These
 * helpers normalise untrusted query input into safe, bounded values.
 */

/**
 * @param {object} query raw `req.query`
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : PAGINATION.DEFAULT_PAGE;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, PAGINATION.MAX_LIMIT)
      : PAGINATION.DEFAULT_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Translate `?sort=-createdAt,name` into a Mongoose sort object, accepting only
 * whitelisted fields so a caller cannot force an unindexed in-memory sort.
 *
 * @param {string} sort
 * @param {string[]} allowedFields
 * @param {object} fallback
 */
function parseSort(sort, allowedFields = [], fallback = { createdAt: -1 }) {
  if (!sort || typeof sort !== 'string') return fallback;

  const parsed = {};
  for (const token of sort.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const descending = trimmed.startsWith('-');
    const field = descending ? trimmed.slice(1) : trimmed;
    if (allowedFields.includes(field)) {
      parsed[field] = descending ? -1 : 1;
    }
  }

  return Object.keys(parsed).length ? parsed : fallback;
}

/**
 * Shape a page of results for the API. `totalPages` is computed once here rather
 * than by each caller.
 */
function buildPage({ items, total, page, limit }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

module.exports = { parsePagination, parseSort, buildPage };
