'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const attachmentRoutes = require('../attachments/attachment.routes');
const commentRoutes = require('../comments/comment.routes');
const controller = require('./task.controller');
const schemas = require('./task.validation');

const router = Router();
router.use(authenticate);

router.post('/', validate(schemas.createTask), controller.create);
router.get('/', validate(schemas.listTasks), controller.list);
router.get('/assigned-to-me', validate(schemas.listTasks), controller.listAssignedToMe);
router.get('/stats', validate(schemas.stats), controller.stats);

router.get('/:taskId', validate(schemas.taskParams), controller.get);
router.patch('/:taskId', validate(schemas.updateTask), controller.update);
router.patch('/:taskId/status', validate(schemas.updateStatus), controller.update);
router.patch('/:taskId/assignee', validate(schemas.updateAssignee), controller.update);
router.delete('/:taskId', validate(schemas.taskParams), controller.remove);

router.use('/:taskId/comments', commentRoutes);
router.use('/:taskId/attachments', attachmentRoutes);

module.exports = router;
