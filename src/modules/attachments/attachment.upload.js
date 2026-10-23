'use strict';

const path = require('node:path');
const multer = require('multer');
const config = require('../../config/env');
const storage = require('../../services/storage');
const ApiError = require('../../utils/ApiError');

/**
 * Allow-list of accepted attachment types: MIME type -> permitted extensions.
 * Both must agree, which blocks e.g. an HTML/SVG payload renamed to ".png".
 * Downloads are always served with "Content-Disposition: attachment" and
 * "X-Content-Type-Options: nosniff", so files are never rendered inline.
 */
const ALLOWED_TYPES = new Map([
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['application/pdf', ['.pdf']],
  ['text/plain', ['.txt', '.log']],
  ['text/csv', ['.csv']],
  ['text/markdown', ['.md']],
  ['application/json', ['.json']],
  ['application/zip', ['.zip']],
  ['application/x-zip-compressed', ['.zip']],
  ['application/msword', ['.doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.ms-excel', ['.xls']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['application/vnd.ms-powerpoint', ['.ppt']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['.pptx']],
]);

function fileFilter(_req, file, cb) {
  const extensions = ALLOWED_TYPES.get(file.mimetype);
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!extensions || !extensions.includes(ext)) {
    return cb(
      ApiError.unsupportedMediaType(
        `File type not allowed: ${file.originalname} (${file.mimetype})`,
      ),
    );
  }
  return cb(null, true);
}

const upload = multer({
  storage: storage.multerStorage(),
  fileFilter,
  limits: {
    fileSize: config.uploads.maxFileSizeBytes,
    files: config.uploads.maxFiles,
    fields: 5,
    parts: config.uploads.maxFiles + 5,
  },
});

/** Accepts up to MAX_FILES_PER_UPLOAD files in the multipart field "files". */
const uploadFiles = upload.array('files', config.uploads.maxFiles);

/** Strips directory components and control characters from a client file name. */
function sanitizeFileName(name) {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point.
  const base = path.basename(String(name || 'file')).replace(/[\x00-\x1f\x7f]/g, '');
  return base.slice(-255) || 'file';
}

module.exports = { uploadFiles, sanitizeFileName, ALLOWED_TYPES };
