'use strict';

const { z } = require('zod');
const { INVITATION_STATUS, TEAM_ROLE } = require('../../constants');
const {
  email,
  idParam,
  objectId,
  paginationQuery,
  nullableText,
} = require('../../utils/validators');

const teamParams = idParam('teamId');

const createTeam = {
  body: z
    .object({
      name: z.string().trim().min(2).max(100),
      description: nullableText(1000).optional(),
    })
    .strict(),
};

const listTeams = {
  query: z
    .object({
      ...paginationQuery,
      search: z.string().trim().min(1).max(100).optional(),
    })
    .strict(),
};

const updateTeam = {
  params: teamParams,
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      description: nullableText(1000).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
};

const memberParams = { params: z.object({ teamId: objectId, userId: objectId }).strict() };

const changeMemberRole = {
  ...memberParams,
  body: z.object({ role: z.enum([TEAM_ROLE.ADMIN, TEAM_ROLE.MEMBER]) }).strict(),
};

const invite = {
  params: teamParams,
  body: z
    .object({
      email,
      role: z.enum([TEAM_ROLE.ADMIN, TEAM_ROLE.MEMBER]).default(TEAM_ROLE.MEMBER),
    })
    .strict(),
};

const listInvitations = {
  params: teamParams,
  query: z
    .object({
      ...paginationQuery,
      status: z.enum(Object.values(INVITATION_STATUS)).optional(),
    })
    .strict(),
};

const invitationInTeam = {
  params: z.object({ teamId: objectId, invitationId: objectId }).strict(),
};

const invitationParams = { params: idParam('invitationId') };

const join = {
  body: z
    .object({
      inviteCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z2-9]{10}$/, 'Invalid invite code'),
    })
    .strict(),
};

module.exports = {
  teamParams: { params: teamParams },
  createTeam,
  listTeams,
  updateTeam,
  memberParams,
  changeMemberRole,
  invite,
  listInvitations,
  invitationInTeam,
  invitationParams,
  join,
};
