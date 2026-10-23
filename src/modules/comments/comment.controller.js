'use strict';

const { sendSuccess, sendCreated, sendNoContent } = require('../../utils/response');
const commentService = require('./comment.service');

async function list(req, res) {
  const { items, meta } = await commentService.listComments(
    req.params.taskId,
    req.auth.userId,
    req.query,
  );
  return sendSuccess(res, items, { meta });
}

async function create(req, res) {
  return sendCreated(res, await commentService.addComment(req.params.taskId, req.user, req.body));
}

async function update(req, res) {
  const { taskId, commentId } = req.params;
  return sendSuccess(
    res,
    await commentService.updateComment(taskId, commentId, req.user, req.body),
  );
}

async function remove(req, res) {
  await commentService.deleteComment(req.params.taskId, req.params.commentId, req.user);
  return sendNoContent(res);
}

module.exports = { list, create, update, remove };
