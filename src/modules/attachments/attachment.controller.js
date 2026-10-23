'use strict';

const ApiError = require('../../utils/ApiError');
const { sendSuccess, sendCreated, sendNoContent } = require('../../utils/response');
const { loadTask } = require('../tasks/task.policy');
const attachmentService = require('./attachment.service');

/**
 * Authorizes the upload BEFORE multer touches the request body, so files from
 * users without access to the task are never written to storage.
 */
async function authorizeUpload(req, res, next) {
  const { task } = await loadTask(req.params.taskId, req.auth.userId);
  req.task = task;
  next();
}

async function list(req, res) {
  return sendSuccess(
    res,
    await attachmentService.listAttachments(req.params.taskId, req.auth.userId),
  );
}

async function upload(req, res) {
  return sendCreated(res, await attachmentService.addAttachments(req.task, req.user, req.files));
}

async function download(req, res, next) {
  const { attachment, file } = await attachmentService.getAttachmentFile(
    req.params.taskId,
    req.params.attachmentId,
    req.auth.userId,
  );
  // `root` sandboxes the lookup: only the storage key itself is resolved and checked.
  res.download(
    file.key,
    attachment.originalName,
    {
      root: file.root,
      headers: { 'Content-Type': attachment.mimeType, 'Cache-Control': 'private, no-store' },
      dotfiles: 'deny',
    },
    (err) => {
      if (!err || res.headersSent) return;
      next(err.code === 'ENOENT' ? ApiError.notFound('Attachment file') : err);
    },
  );
}

async function remove(req, res) {
  await attachmentService.deleteAttachment(req.params.taskId, req.params.attachmentId, req.user);
  return sendNoContent(res);
}

module.exports = { authorizeUpload, list, upload, download, remove };
