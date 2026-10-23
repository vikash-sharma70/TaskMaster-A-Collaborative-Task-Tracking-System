'use strict';

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const { aiLimiter } = require('../../middlewares/rateLimiters');
const validate = require('../../middlewares/validate');
const controller = require('./ai.controller');
const schemas = require('./ai.validation');

const router = Router();
router.use(authenticate, aiLimiter);

router.post(
  '/task-description',
  validate(schemas.generateDescription),
  controller.generateDescription,
);
router.post('/tasks/:taskId/summary', validate(schemas.summarizeTask), controller.summarizeTask);

module.exports = router;
