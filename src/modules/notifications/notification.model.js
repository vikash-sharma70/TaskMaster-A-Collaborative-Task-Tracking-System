'use strict';

const mongoose = require('mongoose');
const config = require('../../config/env');
const { NOTIFICATION_TYPE } = require('../../constants');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    message: { type: String, required: true, maxlength: 500 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    // Small, type-specific payload (e.g. changed fields, invitation id).
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

// Inbox listing + unread counter.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// Old notifications are purged automatically.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.notificationTtlSeconds });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
