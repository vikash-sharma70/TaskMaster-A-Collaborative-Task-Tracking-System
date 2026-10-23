'use strict';

const { sendSuccess, sendCreated, sendNoContent } = require('../../utils/response');
const teamService = require('./team.service');

async function create(req, res) {
  return sendCreated(res, await teamService.createTeam(req.user, req.body));
}

async function list(req, res) {
  const { items, meta } = await teamService.listMyTeams(req.auth.userId, req.query);
  return sendSuccess(res, items, { meta });
}

async function get(req, res) {
  return sendSuccess(res, await teamService.getTeam(req.params.teamId, req.auth.userId));
}

async function update(req, res) {
  return sendSuccess(
    res,
    await teamService.updateTeam(req.params.teamId, req.auth.userId, req.body),
  );
}

async function remove(req, res) {
  await teamService.deleteTeam(req.params.teamId, req.user);
  return sendNoContent(res);
}

async function listMembers(req, res) {
  return sendSuccess(res, await teamService.listMembers(req.params.teamId, req.auth.userId));
}

async function changeMemberRole(req, res) {
  const { teamId, userId } = req.params;
  return sendSuccess(
    res,
    await teamService.changeMemberRole(teamId, req.auth.userId, userId, req.body.role),
  );
}

async function removeMember(req, res) {
  await teamService.removeMember(req.params.teamId, req.user, req.params.userId);
  return sendNoContent(res);
}

async function leave(req, res) {
  await teamService.removeMember(req.params.teamId, req.user, req.auth.userId);
  return sendNoContent(res);
}

async function invite(req, res) {
  return sendCreated(res, await teamService.inviteMember(req.params.teamId, req.user, req.body));
}

async function listInvitations(req, res) {
  const { items, meta } = await teamService.listTeamInvitations(
    req.params.teamId,
    req.auth.userId,
    req.query,
  );
  return sendSuccess(res, items, { meta });
}

async function revokeInvitation(req, res) {
  const { teamId, invitationId } = req.params;
  return sendSuccess(
    res,
    await teamService.revokeInvitation(teamId, req.auth.userId, invitationId),
  );
}

async function regenerateInviteCode(req, res) {
  return sendSuccess(
    res,
    await teamService.regenerateInviteCode(req.params.teamId, req.auth.userId),
  );
}

async function join(req, res) {
  return sendSuccess(res, await teamService.joinByInviteCode(req.user, req.body.inviteCode));
}

/* --------------------- /invitations (current user's inbox) --------------------- */

async function myInvitations(req, res) {
  return sendSuccess(res, await teamService.listMyInvitations(req.user));
}

async function acceptInvitation(req, res) {
  return sendSuccess(
    res,
    await teamService.respondToInvitation(req.user, req.params.invitationId, true),
  );
}

async function declineInvitation(req, res) {
  return sendSuccess(
    res,
    await teamService.respondToInvitation(req.user, req.params.invitationId, false),
  );
}

module.exports = {
  create,
  list,
  get,
  update,
  remove,
  listMembers,
  changeMemberRole,
  removeMember,
  leave,
  invite,
  listInvitations,
  revokeInvitation,
  regenerateInviteCode,
  join,
  myInvitations,
  acceptInvitation,
  declineInvitation,
};
