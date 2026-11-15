'use strict';

const asyncHandler = require('../utils/asyncHandler');
const handle = require('../utils/handle');
const { sendSuccess } = require('../utils/apiResponse');
const analyticsService = require('../services/analyticsService');

/**
 * Reporting reads are pre-aggregated snapshots, not live counts, so none of these handlers is a
 * page — a dashboard asks for a board, not for page two of one.
 */

const catalogue = handle((req) => analyticsService.catalogue(req.user));

const dashboard = handle((req) => analyticsService.dashboard(req.user, req.query));

const series = handle((req) => analyticsService.series(req.params.metric, req.query, req.user));

const compare = asyncHandler(async (req, res) => {
  const { metrics, ...options } = req.query;
  const data = await analyticsService.compare(metrics, options, req.user);
  return sendSuccess(res, { data });
});

const liveBoard = handle((req) => analyticsService.liveBoard(req.user));

const wardOccupancy = handle((req) => analyticsService.wardOccupancy(req.user));

const refresh = asyncHandler(async (req, res) => {
  const data = await analyticsService.refresh(req.user, req.body);
  return sendSuccess(res, { data, message: 'Rollup complete' });
});

const record = handle((req) => analyticsService.record(req.body, req.user));

const purge = asyncHandler(async (req, res) => {
  const data = await analyticsService.purge(req.body, req.user);
  return sendSuccess(res, { data, message: 'Old snapshots removed' });
});

module.exports = {
  catalogue,
  dashboard,
  series,
  compare,
  liveBoard,
  wardOccupancy,
  refresh,
  record,
  purge,
};
