'use strict';

const handle = require('../utils/handle');
const authService = require('../services/authService');

/**
 * Controllers are deliberately thin: read the (already validated) request, call one service
 * method, send the envelope.
 */

const register = handle.created((req) => authService.register(req.body));

const login = handle((req) => authService.login(req.body));

const refresh = handle((req) => authService.refresh(req.body.refreshToken));

const logout = handle((req) => authService.logout(req.body.refreshToken));

const logoutEverywhere = handle((req) => authService.logoutEverywhere(req.user.id));

const changePassword = handle((req) => authService.changePassword(req.user.id, req.body));

const me = handle((req) => authService.me(req.user.id));

module.exports = { register, login, refresh, logout, logoutEverywhere, changePassword, me };
