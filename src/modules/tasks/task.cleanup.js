'use strict';

const storage = require('../../services/storage');
const Attachment = require('../attachments/attachment.model');
const Comment = require('../comments/comment.model');
const Task = require('./task.model');

/**
 * Deletes the given tasks together with their comments, attachment records
 * and stored files. Used for single task deletion and team deletion cascades.
 * @param {Array<import('mongoose').Types.ObjectId|string>} taskIds
 */
async function deleteTasksCascade(taskIds) {
  if (!taskIds.length) return;
  const attachments = await Attachment.find({ task: { $in: taskIds } })
    .select('+storageKey')
    .lean();

  await Promise.all([
    Task.deleteMany({ _id: { $in: taskIds } }),
    Comment.deleteMany({ task: { $in: taskIds } }),
    Attachment.deleteMany({ task: { $in: taskIds } }),
  ]);
  // Files are removed last: a crash before this leaves orphan files (harmless,
  // sweepable) rather than records pointing to missing files.
  await storage.remove(attachments.map((a) => a.storageKey));
}

module.exports = { deleteTasksCascade };
