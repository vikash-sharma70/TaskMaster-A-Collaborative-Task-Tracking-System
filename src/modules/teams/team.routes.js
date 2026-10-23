'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const controller = require('./team.controller');
const schemas = require('./team.validation');

/* ---------------------------------- /teams --------------------------------- */
const teamRouter = Router();
teamRouter.use(authenticate);

teamRouter.post('/', validate(schemas.createTeam), controller.create);
teamRouter.get('/', validate(schemas.listTeams), controller.list);
teamRouter.post('/join', validate(schemas.join), controller.join);

teamRouter.get('/:teamId', validate(schemas.teamParams), controller.get);
teamRouter.patch('/:teamId', validate(schemas.updateTeam), controller.update);
teamRouter.delete('/:teamId', validate(schemas.teamParams), controller.remove);

teamRouter.get('/:teamId/members', validate(schemas.teamParams), controller.listMembers);
teamRouter.patch(
  '/:teamId/members/:userId',
  validate(schemas.changeMemberRole),
  controller.changeMemberRole,
);
teamRouter.delete(
  '/:teamId/members/:userId',
  validate(schemas.memberParams),
  controller.removeMember,
);
teamRouter.post('/:teamId/leave', validate(schemas.teamParams), controller.leave);

teamRouter.post('/:teamId/invitations', validate(schemas.invite), controller.invite);
teamRouter.get(
  '/:teamId/invitations',
  validate(schemas.listInvitations),
  controller.listInvitations,
);
teamRouter.delete(
  '/:teamId/invitations/:invitationId',
  validate(schemas.invitationInTeam),
  controller.revokeInvitation,
);
teamRouter.post(
  '/:teamId/invite-code',
  validate(schemas.teamParams),
  controller.regenerateInviteCode,
);

/* ------------------------------- /invitations ------------------------------ */
const invitationRouter = Router();
invitationRouter.use(authenticate);

invitationRouter.get('/', controller.myInvitations);
invitationRouter.post(
  '/:invitationId/accept',
  validate(schemas.invitationParams),
  controller.acceptInvitation,
);
invitationRouter.post(
  '/:invitationId/decline',
  validate(schemas.invitationParams),
  controller.declineInvitation,
);

module.exports = { teamRouter, invitationRouter };
