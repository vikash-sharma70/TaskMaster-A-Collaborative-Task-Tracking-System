'use strict';

const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 255 },
    size: { type: Number, required: true, min: 0 },
    // Opaque key in the storage backend; never exposed to clients.
    storageKey: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

attachmentSchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema);
