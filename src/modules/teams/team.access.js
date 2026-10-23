'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { TEAM_MANAGER_ROLES } = require('../../constants');
const Team = require('./team.model');

/**
 * Membership / authorization helpers shared by every module that needs to
 * reason about team access. Lives apart from the team service to keep the
 * dependency graph acyclic (tasks -> access, teams -> tasks cleanup).
 */

/**
 * Loads the caller's membership in a team.
 * Non-members get a 404 (not 403) so team existence is not disclosed.
 * @returns {Promise<{ team: object, role: string }>}
 */
async function getMembership(teamId, userId) {
  const team = await Team.findOne(
    { _id: teamId, 'members.user': userId },
    { name: 1, owner: 1, 'members.$': 1 },
  ).lean();
  if (!team) throw ApiError.notFound('Team');
  const [membership] = team.members;
  delete team.members;
  return { team, role: membership.role };
}

/** Like getMembership, but additionally requires one of `roles`. */
async function requireTeamRole(teamId, userId, roles = TEAM_MANAGER_ROLES) {
  const membership = await getMembership(teamId, userId);
  if (!roles.includes(membership.role)) throw ApiError.forbidden();
  return membership;
}

/** Role of `userId` in `teamId`, or null when not a member. */
async function getRole(teamId, userId) {
  const team = await Team.findOne(
    { _id: teamId, 'members.user': userId },
    { 'members.$': 1 },
  ).lean();
  return team ? team.members[0].role : null;
}

function isManagerRole(role) {
  return TEAM_MANAGER_ROLES.includes(role);
}

/** Ids of every team the user belongs to (index-only lookup). */
async function getUserTeamIds(userId) {
  return Team.find({ 'members.user': userId }).distinct('_id');
}

/** True when every user in `userIds` is a member of the team. */
async function areMembers(teamId, userIds) {
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  return Boolean(await Team.exists({ _id: teamId, 'members.user': { $all: ids } }));
}

/** True when the two users share at least one team. */
async function shareATeam(userA, userB) {
  return Boolean(await Team.exists({ 'members.user': { $all: [userA, userB] } }));
}

module.exports = {
  getMembership,
  requireTeamRole,
  getRole,
  isManagerRole,
  getUserTeamIds,
  areMembers,
  shareATeam,
};
