'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');
const authService = require('../services/authService');

/**
 * Controllers are deliberately thin: read the (already validated) request, call
 * one service method, send the envelope. No business rules live here — the same
 * operations are reachable from the socket gateway and the scheduled jobs, and a
 * rule that only exists in an HTTP handler is a rule those callers skip.
 *
 * Nothing reads `req.body` defensively either. By the time a handler runs,
 * `validate()` has replaced the segment with the parsed, key-stripped result.
 */

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return sendCreated(res, result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, { data: result });
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  return sendSuccess(res, { data: result });
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.body.refreshToken);
  return sendSuccess(res, { data: result });
});

const logoutEverywhere = asyncHandler(async (req, res) => {
  const result = await authService.logoutEverywhere(req.user.id);
  return sendSuccess(res, { data: result });
});

const changePassword = asyncHandler(async (req, res) => {
  const tokens = await authService.changePassword(req.user.id, req.body);
  return sendSuccess(res, { data: tokens });
});

const me = asyncHandler(async (req, res) => {
  const profile = await authService.me(req.user.id);
  return sendSuccess(res, { data: profile });
});

module.exports = { register, login, refresh, logout, logoutEverywhere, changePassword, me };
