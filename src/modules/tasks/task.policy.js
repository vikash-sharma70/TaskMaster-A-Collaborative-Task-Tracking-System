'use strict';

const ApiError = require('../../utils/ApiError');
const access = require('../teams/team.access');
const Task = require('./task.model');

/**
 * Authorization rules for a task.
 *
 *            | personal task (no team)  | team task
 *  ----------+--------------------------+-------------------------------------
 *  view      | creator                  | any team member
 *  edit      | creator                  | creator, assignee, team owner/admin
 *  assign    | creator (self only)      | creator, assignee, team owner/admin
 *  delete    | creator                  | creator, team owner/admin
 *
 * Comments / attachments require "view"; moderating others' comments or
 * attachments requires "delete" rights on the task.
 */
async function resolvePermissions(task, userId) {
  const uid = String(userId);
  const isCreator = String(task.createdBy?._id ?? task.createdBy) === uid;
  const isAssignee = task.assignee != null && String(task.assignee?._id ?? task.assignee) === uid;

  if (!task.team) {
    const canView = isCreator || isAssignee;
    return { canView, canEdit: canView, canDelete: isCreator, isManager: false, role: null };
  }

  const role = await access.getRole(task.team?._id ?? task.team, uid);
  if (!role) {
    return { canView: false, canEdit: false, canDelete: false, isManager: false, role: null };
  }
  const isManager = access.isManagerRole(role);
  return {
    canView: true,
    canEdit: isCreator || isAssignee || isManager,
    canDelete: isCreator || isManager,
    isManager,
    role,
  };
}

/**
 * Loads a task the caller may view (404 otherwise, never revealing existence).
 * @param {{ lean?: boolean, require?: 'view'|'edit'|'delete' }} [options]
 */
async function loadTask(taskId, userId, { lean = true, require = 'view' } = {}) {
  const query = Task.findById(taskId);
  const task = lean ? await query.lean() : await query;
  if (!task) throw ApiError.notFound('Task');

  const permissions = await resolvePermissions(task, userId);
  if (!permissions.canView) throw ApiError.notFound('Task');
  if (require === 'edit' && !permissions.canEdit) throw ApiError.forbidden();
  if (require === 'delete' && !permissions.canDelete) throw ApiError.forbidden();
  return { task, permissions };
}

module.exports = { resolvePermissions, loadTask };
