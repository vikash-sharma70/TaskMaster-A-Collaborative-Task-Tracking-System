'use strict';

const { sendSuccess, sendNoContent } = require('../../utils/response');
const notificationService = require('./notification.service');

async function list(req, res) {
  const { items, meta } = await notificationService.listNotifications(req.auth.userId, req.query);
  return sendSuccess(res, items, { meta });
}

async function unreadCount(req, res) {
  return sendSuccess(res, { unreadCount: await notificationService.countUnread(req.auth.userId) });
}

async function markRead(req, res) {
  return sendSuccess(
    res,
    await notificationService.markRead(req.auth.userId, req.params.notificationId),
  );
}

async function markAllRead(req, res) {
  return sendSuccess(res, await notificationService.markAllRead(req.auth.userId));
}

async function remove(req, res) {
  await notificationService.deleteNotification(req.auth.userId, req.params.notificationId);
  return sendNoContent(res);
}

module.exports = { list, unreadCount, markRead, markAllRead, remove };
