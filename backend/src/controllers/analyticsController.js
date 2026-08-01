'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const analyticsService = require('../services/analyticsService');

/**
 * Reporting reads are pre-aggregated snapshots, not live counts, so none of
 * these handlers is a page — a dashboard asks for a board, not for page two of
 * one.
 */

const catalogue = asyncHandler(async (req, res) => {
  const data = await analyticsService.catalogue(req.user);
  return sendSuccess(res, { data });
});

const dashboard = asyncHandler(async (req, res) => {
  const data = await analyticsService.dashboard(req.user, req.query);
  return sendSuccess(res, { data });
});

const series = asyncHandler(async (req, res) => {
  const data = await analyticsService.series(req.params.metric, req.query, req.user);
  return sendSuccess(res, { data });
});

const compare = asyncHandler(async (req, res) => {
  const { metrics, ...options } = req.query;
  const data = await analyticsService.compare(metrics, options, req.user);
  return sendSuccess(res, { data });
});

const liveBoard = asyncHandler(async (req, res) => {
  const data = await analyticsService.liveBoard(req.user);
  return sendSuccess(res, { data });
});

const wardOccupancy = asyncHandler(async (req, res) => {
  const data = await analyticsService.wardOccupancy(req.user);
  return sendSuccess(res, { data });
});

const refresh = asyncHandler(async (req, res) => {
  const data = await analyticsService.refresh(req.user, req.body);
  return sendSuccess(res, { data, message: 'Rollup complete' });
});

const record = asyncHandler(async (req, res) => {
  const data = await analyticsService.record(req.body, req.user);
  return sendSuccess(res, { data });
});

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
