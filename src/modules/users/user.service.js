'use strict';

const ApiError = require('../../utils/ApiError');
const authService = require('../auth/auth.service');
const { shareATeam } = require('../teams/team.access');
const User = require('./user.model');

async function getById(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}

/** Profiles are visible to the user themselves and to people they share a team with. */
async function getPublicProfile(userId, viewerId) {
  if (String(userId) !== String(viewerId) && !(await shareATeam(userId, viewerId))) {
    throw ApiError.notFound('User');
  }
  const user = await User.findById(userId).select(`${User.PUBLIC_FIELDS} bio createdAt`).lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}

async function updateProfile(userId, updates) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true },
  ).lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}

/**
 * Changes the password and signs out every OTHER device, so a leaked
 * password/session cannot outlive the change.
 */
async function changePassword(userId, { currentPassword, newPassword }, currentSessionId) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();
  await authService.revokeAllSessions(userId, { exceptSessionId: currentSessionId });
}

module.exports = { getById, getPublicProfile, updateProfile, changePassword };
