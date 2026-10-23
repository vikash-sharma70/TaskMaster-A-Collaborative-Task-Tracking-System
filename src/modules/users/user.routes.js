'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const controller = require('./user.controller');
const schemas = require('./user.validation');

const router = Router();

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', validate(schemas.updateProfile), controller.updateMe);
router.patch('/me/password', validate(schemas.changePassword), controller.changePassword);
router.get('/:userId', validate(schemas.getUser), controller.getUser);

module.exports = router;
