'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { authLimiter } = require('../../middlewares/rateLimiters');
const controller = require('./auth.controller');
const schemas = require('./auth.validation');

const router = Router();

router.post('/register', authLimiter, validate(schemas.register), controller.register);
router.post('/login', authLimiter, validate(schemas.login), controller.login);
router.post('/refresh', authLimiter, validate(schemas.refresh), controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);
router.get('/sessions', authenticate, controller.listSessions);

module.exports = router;
