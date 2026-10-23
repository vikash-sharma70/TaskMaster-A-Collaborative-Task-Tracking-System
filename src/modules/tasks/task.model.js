'use strict';

const mongoose = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY, PRIORITY_RANK } = require('../../constants');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10_000, default: '' },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.OPEN,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
    },
    // Derived from `priority`; lets the API sort low < medium < high < urgent.
    priorityRank: { type: Number, select: false },
    dueDate: { type: Date, default: null },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
      default: [],
      validate: { validator: (tags) => tags.length <= 10, message: 'At most 10 tags' },
    },
    // null => personal task, visible only to its creator.
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    // Denormalised counters so task lists never need $lookup/count queries.
    commentCount: { type: Number, default: 0, min: 0 },
    attachmentCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    // Concurrent edits of the same task fail with 409 instead of silently overwriting.
    optimisticConcurrency: true,
  },
);

taskSchema.pre('validate', function deriveFields() {
  if (this.isModified('priority') || this.isNew) this.priorityRank = PRIORITY_RANK[this.priority];
  if (this.isModified('status')) {
    this.completedAt = this.status === TASK_STATUS.COMPLETED ? new Date() : null;
  }
});

// Full-text search over title (weighted) and description.
taskSchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, description: 1 }, name: 'task_text_search' },
);
// "My tasks" views.
taskSchema.index({ assignee: 1, status: 1, dueDate: 1 });
taskSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
// Team board views.
taskSchema.index({ team: 1, status: 1, createdAt: -1 });
taskSchema.index({ team: 1, assignee: 1 });

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);
