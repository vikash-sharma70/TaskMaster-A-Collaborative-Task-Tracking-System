'use strict';

const mongoose = require('mongoose');
const config = require('../../config/env');
const { EVENTS, INVITATION_STATUS, TEAM_ROLE } = require('../../constants');
const eventBus = require('../../events/eventBus');
const ApiError = require('../../utils/ApiError');
const { shortCode } = require('../../utils/crypto');
const { buildPageMeta, toPagination } = require('../../utils/pagination');
const { escapeRegex } = require('../../utils/regex');
const Task = require('../tasks/task.model');
const { deleteTasksCascade } = require('../tasks/task.cleanup');
const User = require('../users/user.model');
const access = require('./team.access');
const Invitation = require('./invitation.model');
const Team = require('./team.model');

const { MAX_TEAM_MEMBERS } = Team;
const MEMBER_POPULATE = { path: 'members.user', select: User.PUBLIC_FIELDS };

const actorOf = (user) => ({ _id: user._id, name: user.name });

/** Shapes a team for the caller: adds `myRole`, hides the invite code from non-managers. */
function present(team, role) {
  const out = { ...team, myRole: role, memberCount: team.members?.length ?? team.memberCount };
  if (!access.isManagerRole(role)) delete out.inviteCode;
  return out;
}

async function createTeam(user, { name, description }) {
  const team = await Team.create({
    name,
    description,
    owner: user._id,
    members: [{ user: user._id, role: TEAM_ROLE.OWNER }],
    inviteCode: shortCode(),
  });
  eventBus.publish(EVENTS.TEAM_CREATED, { teamId: String(team._id), userId: String(user._id) });
  return getTeam(team._id, user._id);
}

/** Teams the user belongs to, most recently active first. */
async function listMyTeams(userId, { page, limit, search }) {
  const paging = toPagination({ page, limit });
  // Aggregation pipelines bypass Mongoose casting, so cast explicitly.
  const me = new mongoose.Types.ObjectId(String(userId));
  const filter = { 'members.user': me };
  if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };

  const [teams, total] = await Promise.all([
    Team.aggregate([
      { $match: filter },
      { $sort: { updatedAt: -1, _id: -1 } },
      { $skip: paging.skip },
      { $limit: paging.limit },
      {
        $project: {
          name: 1,
          description: 1,
          owner: 1,
          createdAt: 1,
          updatedAt: 1,
          memberCount: { $size: '$members' },
          myRole: {
            $let: {
              vars: {
                me: {
                  $first: {
                    $filter: { input: '$members', cond: { $eq: ['$$this.user', me] } },
                  },
                },
              },
              in: '$$me.role',
            },
          },
        },
      },
    ]),
    Team.countDocuments(filter),
  ]);
  return { items: teams, meta: buildPageMeta(paging, total) };
}

async function getTeam(teamId, userId) {
  const team = await Team.findOne({ _id: teamId, 'members.user': userId })
    .select('+inviteCode')
    .populate(MEMBER_POPULATE)
    .populate({ path: 'owner', select: User.PUBLIC_FIELDS })
    .lean();
  if (!team) throw ApiError.notFound('Team');
  const me = team.members.find((m) => m.user && String(m.user._id) === String(userId));
  return present(team, me.role);
}

async function updateTeam(teamId, userId, updates) {
  await access.requireTeamRole(teamId, userId);
  await Team.updateOne({ _id: teamId }, { $set: updates }, { runValidators: true });
  return getTeam(teamId, userId);
}

/** Owner-only. Cascades to the team's tasks, comments, attachments and invitations. */
async function deleteTeam(teamId, user) {
  const { team } = await access.requireTeamRole(teamId, user._id, [TEAM_ROLE.OWNER]);
  const full = await Team.findById(teamId).select('members.user').lean();
  const taskIds = await Task.find({ team: teamId }).distinct('_id');

  await deleteTasksCascade(taskIds);
  await Promise.all([Invitation.deleteMany({ team: teamId }), Team.deleteOne({ _id: teamId })]);

  eventBus.publish(EVENTS.TEAM_DELETED, {
    team,
    memberIds: full.members.map((m) => String(m.user)),
    actor: actorOf(user),
  });
}

async function listMembers(teamId, userId) {
  await access.getMembership(teamId, userId);
  const team = await Team.findById(teamId).select('members').populate(MEMBER_POPULATE).lean();
  return team.members.filter((m) => m.user);
}

/**
 * Atomically appends a member. The filter enforces "not already a member"
 * and the size cap in a single write, so concurrent joins cannot race.
 */
async function addMember(teamId, userId, role) {
  const result = await Team.updateOne(
    {
      _id: teamId,
      'members.user': { $ne: userId },
      [`members.${MAX_TEAM_MEMBERS - 1}`]: { $exists: false },
    },
    { $push: { members: { user: userId, role, joinedAt: new Date() } } },
  );
  if (result.modifiedCount === 1) return;

  const team = await Team.findById(teamId).select('members.user').lean();
  if (!team) throw ApiError.notFound('Team');
  if (team.members.some((m) => String(m.user) === String(userId))) {
    throw ApiError.conflict('You are already a member of this team', 'ALREADY_MEMBER');
  }
  throw ApiError.conflict(`Team has reached the limit of ${MAX_TEAM_MEMBERS} members`, 'TEAM_FULL');
}

async function changeMemberRole(teamId, actorId, memberId, role) {
  await access.requireTeamRole(teamId, actorId, [TEAM_ROLE.OWNER]);
  if (String(actorId) === String(memberId)) {
    throw ApiError.badRequest('The owner cannot change their own role');
  }
  const result = await Team.updateOne(
    { _id: teamId, members: { $elemMatch: { user: memberId, role: { $ne: TEAM_ROLE.OWNER } } } },
    { $set: { 'members.$.role': role } },
  );
  if (result.matchedCount === 0) throw ApiError.notFound('Member');
  return listMembers(teamId, actorId);
}

/**
 * Removes a member (or lets a member leave).
 *  - anyone may leave, except the owner (who must delete the team instead)
 *  - admins may remove plain members; the owner may remove anyone
 * The removed member's tasks in this team are unassigned.
 */
async function removeMember(teamId, actor, memberId) {
  const actorId = String(actor._id);
  const isSelf = actorId === String(memberId);
  const [actorRole, memberRole] = await Promise.all([
    access.getRole(teamId, actorId),
    isSelf ? null : access.getRole(teamId, memberId),
  ]);
  if (!actorRole) throw ApiError.notFound('Team');
  const targetRole = isSelf ? actorRole : memberRole;
  if (!targetRole) throw ApiError.notFound('Member');

  if (targetRole === TEAM_ROLE.OWNER) {
    throw ApiError.badRequest('The team owner cannot leave or be removed; delete the team instead');
  }
  if (!isSelf) {
    const allowed =
      actorRole === TEAM_ROLE.OWNER ||
      (actorRole === TEAM_ROLE.ADMIN && targetRole === TEAM_ROLE.MEMBER);
    if (!allowed) throw ApiError.forbidden();
  }

  await Team.updateOne({ _id: teamId }, { $pull: { members: { user: memberId } } });
  await Task.updateMany({ team: teamId, assignee: memberId }, { $set: { assignee: null } });

  eventBus.publish(EVENTS.TEAM_MEMBER_REMOVED, {
    teamId: String(teamId),
    userId: String(memberId),
    actor: actorOf(actor),
    left: isSelf,
  });
}

/* ------------------------------ Invitations ------------------------------ */

async function inviteMember(teamId, actor, { email, role }) {
  const { team } = await access.requireTeamRole(teamId, actor._id);
  if (role === TEAM_ROLE.ADMIN) {
    // Only the owner can grant admin rights.
    await access.requireTeamRole(teamId, actor._id, [TEAM_ROLE.OWNER]);
  }

  const invitee = await User.findOne({ email }).select('_id').lean();
  if (invitee && (await access.getRole(teamId, invitee._id))) {
    throw ApiError.conflict('This user is already a member of the team', 'ALREADY_MEMBER');
  }

  let invitation;
  try {
    invitation = await Invitation.create({
      team: teamId,
      email,
      role,
      invitedBy: actor._id,
      expiresAt: new Date(Date.now() + config.invitationTtlMs),
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict(
        'A pending invitation already exists for this email',
        'INVITATION_EXISTS',
      );
    }
    throw err;
  }

  eventBus.publish(EVENTS.INVITATION_CREATED, {
    invitation: invitation.toObject(),
    team,
    inviteeId: invitee ? String(invitee._id) : null,
    actor: actorOf(actor),
  });
  return invitation;
}

async function listTeamInvitations(teamId, userId, { status, page, limit }) {
  await access.requireTeamRole(teamId, userId);
  const paging = toPagination({ page, limit });
  const filter = { team: teamId };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Invitation.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .populate({ path: 'invitedBy', select: User.PUBLIC_FIELDS })
      .lean(),
    Invitation.countDocuments(filter),
  ]);
  return { items, meta: buildPageMeta(paging, total) };
}

async function revokeInvitation(teamId, userId, invitationId) {
  await access.requireTeamRole(teamId, userId);
  const invitation = await Invitation.findOneAndUpdate(
    { _id: invitationId, team: teamId, status: INVITATION_STATUS.PENDING },
    { $set: { status: INVITATION_STATUS.REVOKED, respondedAt: new Date() } },
    { new: true },
  ).lean();
  if (!invitation) throw ApiError.notFound('Pending invitation');
  return invitation;
}

/** Pending, unexpired invitations addressed to the user's email. */
async function listMyInvitations(user) {
  return Invitation.find({
    email: user.email,
    status: INVITATION_STATUS.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .populate({ path: 'team', select: 'name description' })
    .populate({ path: 'invitedBy', select: User.PUBLIC_FIELDS })
    .lean();
}

async function respondToInvitation(user, invitationId, accept) {
  const now = new Date();
  const invitation = await Invitation.findOneAndUpdate(
    {
      _id: invitationId,
      email: user.email,
      status: INVITATION_STATUS.PENDING,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status: accept ? INVITATION_STATUS.ACCEPTED : INVITATION_STATUS.DECLINED,
        respondedAt: now,
      },
    },
    { new: true },
  ).lean();
  if (!invitation) throw ApiError.notFound('Pending invitation');
  if (!accept) return { invitation };

  try {
    await addMember(invitation.team, user._id, invitation.role);
  } catch (err) {
    // Already a member (e.g. joined via invite code meanwhile) is not an error here.
    if (err.code !== 'ALREADY_MEMBER') {
      await Invitation.updateOne(
        { _id: invitation._id },
        { $set: { status: INVITATION_STATUS.PENDING, respondedAt: null } },
      );
      throw err;
    }
  }
  await publishJoined(invitation.team, user);
  return { invitation, team: await getTeam(invitation.team, user._id) };
}

async function joinByInviteCode(user, inviteCode) {
  const team = await Team.findOne({ inviteCode }).select('_id').lean();
  if (!team) throw ApiError.notFound('Team for this invite code');
  await addMember(team._id, user._id, TEAM_ROLE.MEMBER);
  await publishJoined(team._id, user);
  return getTeam(team._id, user._id);
}

async function regenerateInviteCode(teamId, userId) {
  await access.requireTeamRole(teamId, userId);
  const inviteCode = shortCode();
  await Team.updateOne({ _id: teamId }, { $set: { inviteCode } });
  return { inviteCode };
}

async function publishJoined(teamId, user) {
  const team = await Team.findById(teamId).select('name members').lean();
  if (!team) return;
  eventBus.publish(EVENTS.TEAM_MEMBER_JOINED, {
    team: { _id: team._id, name: team.name },
    userId: String(user._id),
    managerIds: team.members.filter((m) => access.isManagerRole(m.role)).map((m) => String(m.user)),
    actor: actorOf(user),
  });
}

module.exports = {
  createTeam,
  listMyTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  listMembers,
  changeMemberRole,
  removeMember,
  inviteMember,
  listTeamInvitations,
  revokeInvitation,
  listMyInvitations,
  respondToInvitation,
  joinByInviteCode,
  regenerateInviteCode,
};
