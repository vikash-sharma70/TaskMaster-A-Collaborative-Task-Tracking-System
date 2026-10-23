'use strict';

const { EVENTS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const ApiError = require('../../utils/ApiError');
const { paginate } = require('../../utils/pagination');
const Task = require('../tasks/task.model');
const { loadTask } = require('../tasks/task.policy');
const User = require('../users/user.model');
const Comment = require('./comment.model');

const AUTHOR_POPULATE = { path: 'author', select: User.PUBLIC_FIELDS };
const actorOf = (user) => ({ _id: user._id, name: user.name });

async function listComments(taskId, userId, { page, limit, order }) {
  await loadTask(taskId, userId);
  const direction = order === 'asc' ? 1 : -1;
  return paginate(Comment, { task: taskId }, { page, limit }, (q) =>
    q.sort({ createdAt: direction, _id: direction }).populate(AUTHOR_POPULATE),
  );
}

async function addComment(taskId, user, { body }) {
  const { task } = await loadTask(taskId, user._id);
  const comment = await Comment.create({ task: task._id, author: user._id, body });
  await Task.updateOne({ _id: task._id }, { $inc: { commentCount: 1 } });

  const populated = await Comment.findById(comment._id).populate(AUTHOR_POPULATE).lean();
  eventBus.publish(EVENTS.COMMENT_CREATED, { task, comment: populated, actor: actorOf(user) });
  return populated;
}

async function findCommentOnTask(taskId, commentId) {
  const comment = await Comment.findOne({ _id: commentId, task: taskId });
  if (!comment) throw ApiError.notFound('Comment');
  return comment;
}

/** Only the author may edit their comment. */
async function updateComment(taskId, commentId, user, { body }) {
  const { task } = await loadTask(taskId, user._id);
  const comment = await findCommentOnTask(taskId, commentId);
  if (String(comment.author) !== String(user._id)) {
    throw ApiError.forbidden('You can only edit your own comments');
  }
  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();

  const populated = await Comment.findById(comment._id).populate(AUTHOR_POPULATE).lean();
  eventBus.publish(EVENTS.COMMENT_UPDATED, { task, comment: populated, actor: actorOf(user) });
  return populated;
}

/** The author, or anyone allowed to delete the task (creator / team manager), may delete. */
async function deleteComment(taskId, commentId, user) {
  const { task, permissions } = await loadTask(taskId, user._id);
  const comment = await findCommentOnTask(taskId, commentId);
  if (String(comment.author) !== String(user._id) && !permissions.canDelete) {
    throw ApiError.forbidden('You can only delete your own comments');
  }
  const { deletedCount } = await Comment.deleteOne({ _id: comment._id });
  if (deletedCount) {
    await Task.updateOne(
      { _id: task._id, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
  }
  eventBus.publish(EVENTS.COMMENT_DELETED, {
    task,
    comment: { _id: comment._id },
    actor: actorOf(user),
  });
}

module.exports = { listComments, addComment, updateComment, deleteComment };
