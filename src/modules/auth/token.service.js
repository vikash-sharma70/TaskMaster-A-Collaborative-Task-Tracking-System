'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const ApiError = require('../../utils/ApiError');

const ALGORITHM = 'HS256';

/**
 * Issues a short-lived access token bound to a user and a session.
 * @returns {{ token: string, expiresAt: Date }}
 */
function signAccessToken({ userId, sessionId }) {
  const token = jwt.sign({ sid: String(sessionId) }, config.jwt.accessSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: config.jwt.accessExpiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    jwtid: crypto.randomUUID(),
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verifies signature, algorithm, issuer, audience and expiry.
 * @returns {{ userId: string, sessionId: string }}
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [ALGORITHM],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    if (!payload.sub || !payload.sid) {
      throw ApiError.unauthorized('Malformed token', 'INVALID_TOKEN');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

module.exports = { signAccessToken, verifyAccessToken };
