'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const controller = require('./notification.controller');
const schemas = require('./notification.validation');

const router = Router();
router.use(authenticate);

router.get('/', validate(schemas.list), controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:notificationId/read', validate(schemas.byId), controller.markRead);
router.delete('/:notificationId', validate(schemas.byId), controller.remove);

module.exports = router;
