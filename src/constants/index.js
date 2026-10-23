'use strict';

/** Domain enumerations shared by models, validators and services. */

const TASK_STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

/** Numeric weight so "priority" can be sorted semantically rather than alphabetically. */
const PRIORITY_RANK = Object.freeze({
  [TASK_PRIORITY.LOW]: 1,
  [TASK_PRIORITY.MEDIUM]: 2,
  [TASK_PRIORITY.HIGH]: 3,
  [TASK_PRIORITY.URGENT]: 4,
});

const TEAM_ROLE = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
});

/** Roles allowed to manage a team (invite, remove members, moderate tasks). */
const TEAM_MANAGER_ROLES = Object.freeze([TEAM_ROLE.OWNER, TEAM_ROLE.ADMIN]);

const INVITATION_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  REVOKED: 'revoked',
});

const NOTIFICATION_TYPE = Object.freeze({
  TASK_ASSIGNED: 'task_assigned',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  TASK_DELETED: 'task_deleted',
  COMMENT_ADDED: 'comment_added',
  ATTACHMENT_ADDED: 'attachment_added',
  TEAM_INVITATION: 'team_invitation',
  TEAM_MEMBER_JOINED: 'team_member_joined',
  TEAM_MEMBER_REMOVED: 'team_member_removed',
});

/** Internal domain events published on the event bus. */
const EVENTS = Object.freeze({
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',
  ATTACHMENTS_ADDED: 'attachments.added',
  ATTACHMENT_DELETED: 'attachment.deleted',
  INVITATION_CREATED: 'invitation.created',
  TEAM_CREATED: 'team.created',
  TEAM_MEMBER_JOINED: 'team.member_joined',
  TEAM_MEMBER_REMOVED: 'team.member_removed',
  TEAM_DELETED: 'team.deleted',
  SESSIONS_REVOKED: 'auth.sessions_revoked',
  NOTIFICATIONS_CREATED: 'notifications.created',
});

module.exports = {
  TASK_STATUS,
  TASK_PRIORITY,
  PRIORITY_RANK,
  TEAM_ROLE,
  TEAM_MANAGER_ROLES,
  INVITATION_STATUS,
  NOTIFICATION_TYPE,
  EVENTS,
};
