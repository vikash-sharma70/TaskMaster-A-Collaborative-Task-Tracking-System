'use strict';

const { EVENTS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const storage = require('../../services/storage');
const ApiError = require('../../utils/ApiError');
const Task = require('../tasks/task.model');
const { loadTask } = require('../tasks/task.policy');
const User = require('../users/user.model');
const Attachment = require('./attachment.model');
const { sanitizeFileName } = require('./attachment.upload');

const UPLOADER_POPULATE = { path: 'uploadedBy', select: User.PUBLIC_FIELDS };
const actorOf = (user) => ({ _id: user._id, name: user.name });

async function listAttachments(taskId, userId) {
  await loadTask(taskId, userId);
  return Attachment.find({ task: taskId })
    .sort({ createdAt: -1, _id: -1 })
    .populate(UPLOADER_POPULATE)
    .lean();
}

/**
 * Persists metadata for files multer already streamed to storage. If the
 * database write fails, the stored files are removed so nothing is orphaned.
 */
async function addAttachments(task, user, files) {
  if (!files?.length) {
    throw ApiError.badRequest('Attach at least one file using the multipart field "files"');
  }
  let created;
  try {
    created = await Attachment.insertMany(
      files.map((file) => ({
        task: task._id,
        uploadedBy: user._id,
        originalName: sanitizeFileName(file.originalname),
        mimeType: file.mimetype,
        size: file.size,
        storageKey: file.filename,
      })),
    );
    await Task.updateOne({ _id: task._id }, { $inc: { attachmentCount: created.length } });
  } catch (err) {
    await storage.remove(files.map((file) => file.filename));
    throw err;
  }

  const attachments = await Attachment.find({ _id: { $in: created.map((a) => a._id) } })
    .sort({ createdAt: -1, _id: -1 })
    .populate(UPLOADER_POPULATE)
    .lean();
  eventBus.publish(EVENTS.ATTACHMENTS_ADDED, { task, attachments, actor: actorOf(user) });
  return attachments;
}

async function getAttachmentFile(taskId, attachmentId, userId) {
  await loadTask(taskId, userId);
  const attachment = await Attachment.findOne({ _id: attachmentId, task: taskId })
    .select('+storageKey')
    .lean();
  if (!attachment) throw ApiError.notFound('Attachment');
  return { attachment, file: storage.locate(attachment.storageKey) };
}

/** The uploader, or anyone allowed to delete the task, may delete an attachment. */
async function deleteAttachment(taskId, attachmentId, user) {
  const { task, permissions } = await loadTask(taskId, user._id);
  const attachment = await Attachment.findOne({ _id: attachmentId, task: taskId })
    .select('+storageKey')
    .lean();
  if (!attachment) throw ApiError.notFound('Attachment');
  if (String(attachment.uploadedBy) !== String(user._id) && !permissions.canDelete) {
    throw ApiError.forbidden('You can only delete attachments you uploaded');
  }

  const { deletedCount } = await Attachment.deleteOne({ _id: attachment._id });
  if (deletedCount) {
    await Task.updateOne(
      { _id: task._id, attachmentCount: { $gt: 0 } },
      { $inc: { attachmentCount: -1 } },
    );
    await storage.remove(attachment.storageKey);
  }
  eventBus.publish(EVENTS.ATTACHMENT_DELETED, {
    task,
    attachment: { _id: attachment._id },
    actor: actorOf(user),
  });
}

module.exports = { listAttachments, addAttachments, getAttachmentFile, deleteAttachment };
