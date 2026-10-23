'use strict';

const ApiError = require('../utils/ApiError');
const { authenticateAccessToken } = require('../modules/auth/auth.service');

/** Extracts the bearer token from the Authorization header. */
function extractBearer(header) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme && scheme.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

/**
 * Requires a valid access token bound to an active session.
 * Populates `req.user` (lean user, no password) and `req.auth`.
 */
async function authenticate(req, res, next) {
  const token = extractBearer(req.get('authorization'));
  if (!token) return next(ApiError.unauthorized('Missing bearer token'));

  const { user, sessionId } = await authenticateAccessToken(token);
  req.user = user;
  req.auth = { userId: String(user._id), sessionId: String(sessionId) };
  return next();
}

module.exports = authenticate;
module.exports.extractBearer = extractBearer;
