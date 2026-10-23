'use strict';

const { sendSuccess, sendCreated, sendNoContent } = require('../../utils/response');
const taskService = require('./task.service');

async function create(req, res) {
  return sendCreated(res, await taskService.createTask(req.user, req.body));
}

async function list(req, res) {
  const { items, meta } = await taskService.listTasks(req.auth.userId, req.query);
  return sendSuccess(res, items, { meta });
}

/** Convenience alias for the "tasks assigned to me" user story. */
async function listAssignedToMe(req, res) {
  const { items, meta } = await taskService.listTasks(req.auth.userId, {
    ...req.query,
    assignee: 'me',
  });
  return sendSuccess(res, items, { meta });
}

async function stats(req, res) {
  return sendSuccess(res, await taskService.getStats(req.auth.userId, req.query));
}

async function get(req, res) {
  return sendSuccess(res, await taskService.getTask(req.params.taskId, req.auth.userId));
}

/** Handles PATCH /tasks/:id, /tasks/:id/status and /tasks/:id/assignee. */
async function update(req, res) {
  return sendSuccess(res, await taskService.updateTask(req.params.taskId, req.user, req.body));
}

async function remove(req, res) {
  await taskService.deleteTask(req.params.taskId, req.user);
  return sendNoContent(res);
}

module.exports = { create, list, listAssignedToMe, stats, get, update, remove };
