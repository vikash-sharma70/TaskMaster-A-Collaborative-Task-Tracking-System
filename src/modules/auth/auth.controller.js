'use strict';

const config = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { sendSuccess, sendCreated, sendNoContent } = require('../../utils/response');
const authService = require('./auth.service');

const REFRESH_COOKIE = 'tm_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function requestContext(req) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

/** Browser clients get the refresh token in an httpOnly cookie; API clients may use the body. */
function setRefreshCookie(res, tokens) {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshTokenExpiresAt,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

async function register(req, res) {
  const { user, tokens } = await authService.register(req.body, requestContext(req));
  setRefreshCookie(res, tokens);
  return sendCreated(res, { user, ...tokens });
}

async function login(req, res) {
  const { user, tokens } = await authService.login(req.body, requestContext(req));
  setRefreshCookie(res, tokens);
  return sendSuccess(res, { user, ...tokens });
}

async function refresh(req, res) {
  const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Refresh token is required', 'INVALID_REFRESH_TOKEN');
  try {
    const tokens = await authService.refresh(token);
    setRefreshCookie(res, tokens);
    return sendSuccess(res, tokens);
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

async function logout(req, res) {
  await authService.logout(req.auth.sessionId);
  clearRefreshCookie(res);
  return sendNoContent(res);
}

async function logoutAll(req, res) {
  await authService.revokeAllSessions(req.auth.userId);
  clearRefreshCookie(res);
  return sendNoContent(res);
}

async function listSessions(req, res) {
  const sessions = await authService.listSessions(req.auth.userId);
  const current = req.auth.sessionId;
  return sendSuccess(
    res,
    sessions.map((session) => ({ ...session, current: String(session._id) === current })),
  );
}

module.exports = { register, login, refresh, logout, logoutAll, listSessions, REFRESH_COOKIE };
