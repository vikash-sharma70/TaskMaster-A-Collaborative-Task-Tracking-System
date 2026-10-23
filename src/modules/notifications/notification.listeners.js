'use strict';

const { EVENTS, NOTIFICATION_TYPE, TASK_STATUS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const { notify } = require('./notification.service');

/**
 * Translates domain events into user notifications.
 *
 *  - task assigned (on create or re-assign)  -> new assignee
 *  - task completed                          -> creator + assignee
 *  - task updated (other changes)            -> creator + assignee (+ previous assignee)
 *  - task deleted                            -> creator + assignee
 *  - comment / attachment added              -> creator + assignee
 *  - team invitation                         -> invitee (if registered)
 *  - member joined                           -> team owner / admins
 *  - member removed                          -> removed member
 * The acting user is never notified about their own action.
 */
const idOf = (value) => (value == null ? null : String(value._id ?? value));
const quote = (title) => `"${title.length > 80 ? `${title.slice(0, 77)}...` : title}"`;

function taskRefs(task) {
  return { task: task._id, team: task.team ?? null };
}

async function onTaskCreated({ task, actor }) {
  if (!task.assignee) return;
  await notify([task.assignee], {
    type: NOTIFICATION_TYPE.TASK_ASSIGNED,
    message: `${actor.name} assigned you ${quote(task.title)}`,
    actor,
    ...taskRefs(task),
  });
}

async function onTaskUpdated({ task, actor, changes, previous }) {
  const assignee = idOf(task.assignee);
  const handled = new Set();

  if (changes.includes('assignee') && assignee) {
    await notify([assignee], {
      type: NOTIFICATION_TYPE.TASK_ASSIGNED,
      message: `${actor.name} assigned you ${quote(task.title)}`,
      actor,
      ...taskRefs(task),
    });
    handled.add(assignee);
  }

  const watchers = [idOf(task.createdBy), assignee];
  if (changes.includes('assignee') && previous.assignee) watchers.push(previous.assignee);
  const recipients = watchers.filter((id) => id && !handled.has(id));

  const completedNow =
    changes.includes('status') &&
    task.status === TASK_STATUS.COMPLETED &&
    previous.status !== TASK_STATUS.COMPLETED;

  if (completedNow) {
    await notify(recipients, {
      type: NOTIFICATION_TYPE.TASK_COMPLETED,
      message: `${actor.name} marked ${quote(task.title)} as completed`,
      actor,
      data: { changes },
      ...taskRefs(task),
    });
    return;
  }

  await notify(recipients, {
    type: NOTIFICATION_TYPE.TASK_UPDATED,
    message: `${actor.name} updated ${quote(task.title)} (${changes.join(', ')})`,
    actor,
    data: { changes, ...(changes.includes('status') && { status: task.status }) },
    ...taskRefs(task),
  });
}

async function onTaskDeleted({ task, actor }) {
  await notify([task.createdBy, task.assignee], {
    type: NOTIFICATION_TYPE.TASK_DELETED,
    message: `${actor.name} deleted ${quote(task.title)}`,
    actor,
    team: task.team ?? null,
    data: { taskTitle: task.title },
  });
}

async function onCommentCreated({ task, comment, actor }) {
  await notify([task.createdBy, task.assignee], {
    type: NOTIFICATION_TYPE.COMMENT_ADDED,
    message: `${actor.name} commented on ${quote(task.title)}`,
    actor,
    data: { commentId: comment._id },
    ...taskRefs(task),
  });
}

async function onAttachmentsAdded({ task, attachments, actor }) {
  const count = attachments.length;
  await notify([task.createdBy, task.assignee], {
    type: NOTIFICATION_TYPE.ATTACHMENT_ADDED,
    message: `${actor.name} attached ${count} file${count === 1 ? '' : 's'} to ${quote(task.title)}`,
    actor,
    data: { attachmentIds: attachments.map((a) => a._id) },
    ...taskRefs(task),
  });
}

async function onInvitationCreated({ invitation, team, inviteeId, actor }) {
  if (!inviteeId) return;
  await notify([inviteeId], {
    type: NOTIFICATION_TYPE.TEAM_INVITATION,
    message: `${actor.name} invited you to join ${quote(team.name)}`,
    actor,
    team: team._id,
    data: { invitationId: invitation._id, role: invitation.role },
  });
}

async function onMemberJoined({ team, userId, managerIds, actor }) {
  await notify(managerIds, {
    type: NOTIFICATION_TYPE.TEAM_MEMBER_JOINED,
    message: `${actor.name} joined ${quote(team.name)}`,
    actor,
    team: team._id,
    data: { userId },
  });
}

async function onMemberRemoved({ teamId, userId, actor, left }) {
  if (left) return;
  await notify([userId], {
    type: NOTIFICATION_TYPE.TEAM_MEMBER_REMOVED,
    message: `${actor.name} removed you from a team`,
    actor,
    team: teamId,
  });
}

let registered = false;

/** Idempotent: safe to call from both the server bootstrap and tests. */
function registerNotificationListeners() {
  if (registered) return;
  registered = true;
  eventBus.subscribe(EVENTS.TASK_CREATED, onTaskCreated);
  eventBus.subscribe(EVENTS.TASK_UPDATED, onTaskUpdated);
  eventBus.subscribe(EVENTS.TASK_DELETED, onTaskDeleted);
  eventBus.subscribe(EVENTS.COMMENT_CREATED, onCommentCreated);
  eventBus.subscribe(EVENTS.ATTACHMENTS_ADDED, onAttachmentsAdded);
  eventBus.subscribe(EVENTS.INVITATION_CREATED, onInvitationCreated);
  eventBus.subscribe(EVENTS.TEAM_MEMBER_JOINED, onMemberJoined);
  eventBus.subscribe(EVENTS.TEAM_MEMBER_REMOVED, onMemberRemoved);
}

module.exports = { registerNotificationListeners };
