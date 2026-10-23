'use strict';

const { EVENTS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const ApiError = require('../../utils/ApiError');
const { paginate } = require('../../utils/pagination');
const User = require('../users/user.model');
const Notification = require('./notification.model');

const ACTOR_POPULATE = { path: 'actor', select: User.PUBLIC_FIELDS };

/**
 * Creates one notification per recipient (deduplicated, never to the actor
 * themselves) and publishes them for real-time delivery.
 */
async function notify(recipientIds, { type, message, actor, task, team, data = {} }) {
  const actorId = actor?._id ? String(actor._id) : null;
  const recipients = [...new Set(recipientIds.filter(Boolean).map(String))].filter(
    (id) => id !== actorId,
  );
  if (!recipients.length) return [];

  const docs = await Notification.insertMany(
    recipients.map((recipient) => ({
      recipient,
      type,
      message: message.slice(0, 500),
      actor: actorId,
      task: task ?? null,
      team: team ?? null,
      data,
    })),
  );
  const payload = docs.map((doc) => ({
    ...doc.toObject(),
    actor: actor ? { _id: actor._id, name: actor.name } : null,
  }));
  eventBus.publish(EVENTS.NOTIFICATIONS_CREATED, payload);
  return payload;
}

async function listNotifications(userId, { page, limit, unread, type }) {
  const filter = { recipient: userId };
  if (unread) filter.readAt = null;
  if (type) filter.type = type;
  const [result, unreadCount] = await Promise.all([
    paginate(Notification, filter, { page, limit }, (q) =>
      q.sort({ createdAt: -1, _id: -1 }).populate(ACTOR_POPULATE),
    ),
    countUnread(userId),
  ]);
  return { items: result.items, meta: { ...result.meta, unreadCount } };
}

function countUnread(userId) {
  return Notification.countDocuments({ recipient: userId, readAt: null });
}

async function markRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    [{ $set: { readAt: { $ifNull: ['$readAt', '$$NOW'] } } }],
    { new: true },
  ).lean();
  if (!notification) throw ApiError.notFound('Notification');
  return notification;
}

async function markAllRead(userId) {
  const { modifiedCount } = await Notification.updateMany(
    { recipient: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: modifiedCount };
}

async function deleteNotification(userId, notificationId) {
  const { deletedCount } = await Notification.deleteOne({ _id: notificationId, recipient: userId });
  if (!deletedCount) throw ApiError.notFound('Notification');
}

module.exports = {
  notify,
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
  deleteNotification,
};
