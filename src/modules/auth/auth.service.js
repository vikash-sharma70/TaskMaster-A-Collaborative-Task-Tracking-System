'use strict';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const config = require('../../config/env');
const { EVENTS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const ApiError = require('../../utils/ApiError');
const { randomToken, sha256 } = require('../../utils/crypto');
const User = require('../users/user.model');
const Session = require('./session.model');
const { signAccessToken, verifyAccessToken } = require('./token.service');

// A valid bcrypt hash used to equalise response time when the email is unknown,
// so attackers cannot enumerate registered accounts through timing.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', config.bcryptSaltRounds);

const invalidCredentials = () =>
  ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
const invalidRefresh = () =>
  ApiError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');

/** Refresh tokens are "<sessionId>.<secret>"; only sha256(secret) is persisted. */
function parseRefreshToken(refreshToken) {
  const [sessionId, secret, extra] = String(refreshToken || '').split('.');
  if (extra !== undefined || !secret || !mongoose.isValidObjectId(sessionId)) return null;
  return { sessionId, secret };
}

function issueTokens(userId, sessionId, secret, refreshExpiresAt) {
  const access = signAccessToken({ userId, sessionId });
  return {
    tokenType: 'Bearer',
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: `${sessionId}.${secret}`,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
}

async function createSession(userId, { userAgent, ip } = {}) {
  const secret = randomToken(48);
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlMs);
  const session = await Session.create({
    user: userId,
    refreshTokenHash: sha256(secret),
    expiresAt,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    ip: ip || null,
  });
  return issueTokens(userId, session._id, secret, expiresAt);
}

async function register({ name, email, password }, context) {
  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  // The unique index still guards the race between exists() and create().
  const user = await User.create({ name, email, password });
  const tokens = await createSession(user._id, context);
  return { user, tokens };
}

async function login({ email, password }, context) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (!(await user.comparePassword(password))) throw invalidCredentials();

  const [tokens] = await Promise.all([
    createSession(user._id, context),
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }),
  ]);
  return { user, tokens };
}

/**
 * Rotates a refresh token. The compare-and-swap on the stored hash makes
 * rotation atomic: two concurrent uses of the same token cannot both succeed,
 * and re-use of a rotated token revokes the whole session (theft detection).
 */
async function refresh(refreshToken) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw invalidRefresh();

  const now = new Date();
  const nextSecret = randomToken(48);
  const session = await Session.findOneAndUpdate(
    {
      _id: parsed.sessionId,
      refreshTokenHash: sha256(parsed.secret),
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { refreshTokenHash: sha256(nextSecret), lastUsedAt: now } },
    { new: true },
  ).lean();

  if (!session) {
    // Either unknown/expired, or a previously rotated token being replayed.
    await Session.updateOne(
      { _id: parsed.sessionId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw invalidRefresh();
  }

  return issueTokens(session.user, session._id, nextSecret, session.expiresAt);
}

async function logout(sessionId) {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  eventBus.publish(EVENTS.SESSIONS_REVOKED, { sessionId: String(sessionId) });
}

/** Revokes every active session of the user, optionally keeping one. */
async function revokeAllSessions(userId, { exceptSessionId } = {}) {
  const filter = { user: userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const { modifiedCount } = await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
  if (modifiedCount) {
    eventBus.publish(EVENTS.SESSIONS_REVOKED, {
      userId: String(userId),
      exceptSessionId: exceptSessionId ? String(exceptSessionId) : null,
    });
  }
  return modifiedCount;
}

async function listSessions(userId) {
  return Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('userAgent ip createdAt lastUsedAt expiresAt')
    .sort({ lastUsedAt: -1 })
    .lean();
}

/**
 * Resolves an access token into an authenticated principal.
 * Shared by the HTTP middleware and the WebSocket handshake.
 */
async function authenticateAccessToken(token) {
  const { userId, sessionId } = verifyAccessToken(token);
  const [sessionActive, user] = await Promise.all([
    Session.exists({
      _id: sessionId,
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }),
    User.findById(userId).lean(),
  ]);
  if (!sessionActive || !user) {
    throw ApiError.unauthorized('Session is no longer valid', 'SESSION_REVOKED');
  }
  return { user, sessionId };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  revokeAllSessions,
  listSessions,
  authenticateAccessToken,
};
