'use strict';

const { Router } = require('express');
const aiRoutes = require('../modules/ai/ai.routes');
const authRoutes = require('../modules/auth/auth.routes');
const notificationRoutes = require('../modules/notifications/notification.routes');
const taskRoutes = require('../modules/tasks/task.routes');
const { teamRouter, invitationRouter } = require('../modules/teams/team.routes');
const userRoutes = require('../modules/users/user.routes');

/** Version 1 of the public REST API, mounted at /api/v1. */
const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRouter);
router.use('/invitations', invitationRouter);
router.use('/tasks', taskRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
