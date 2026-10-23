'use strict';

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

commentSchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
