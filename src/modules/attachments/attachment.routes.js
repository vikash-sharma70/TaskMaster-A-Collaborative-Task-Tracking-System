'use strict';

const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const { idParam, objectId } = require('../../utils/validators');
const controller = require('./attachment.controller');
const { uploadFiles } = require('./attachment.upload');

const taskParams = { params: idParam('taskId') };
const attachmentParams = {
  params: z.object({ taskId: objectId, attachmentId: objectId }).strict(),
};

/** Mounted at /tasks/:taskId/attachments (authentication applied by the parent router). */
const router = Router({ mergeParams: true });

router.get('/', validate(taskParams), controller.list);
router.post('/', validate(taskParams), controller.authorizeUpload, uploadFiles, controller.upload);
router.get('/:attachmentId/download', validate(attachmentParams), controller.download);
router.delete('/:attachmentId', validate(attachmentParams), controller.remove);

module.exports = router;
