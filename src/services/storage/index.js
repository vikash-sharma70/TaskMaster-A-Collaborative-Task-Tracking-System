'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const config = require('../../config/env');
const logger = require('../../config/logger');

/**
 * Local-disk storage driver for attachments.
 *
 * Files are stored under server-generated random keys (never the client's
 * filename), so path traversal and overwrites are impossible. The module's
 * surface (multer engine, stream, remove) is small enough to be swapped for an
 * S3 / GCS driver without touching callers.
 */
const KEY_PATTERN = /^[a-f\d-]{36}(\.[a-z\d]{1,10})?$/;

function ensureStorageDir() {
  fs.mkdirSync(config.uploads.dir, { recursive: true });
}

function generateKey(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = /^\.[a-z\d]{1,10}$/.test(ext) ? ext : '';
  return `${crypto.randomUUID()}${safeExt}`;
}

function resolvePath(key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return path.join(config.uploads.dir, key);
}

/** Multer storage engine that streams uploads straight to disk (no memory buffering). */
function multerStorage() {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploads.dir),
    filename: (_req, file, cb) => cb(null, generateKey(file.originalname)),
  });
}

/** Deletes stored objects; missing files are ignored, other failures logged. */
async function remove(keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  await Promise.all(
    list.map(async (key) => {
      try {
        await fsp.unlink(resolvePath(key));
      } catch (err) {
        if (err.code !== 'ENOENT') logger.warn({ err, key }, 'Failed to delete stored file');
      }
    }),
  );
}

/** Root directory and validated relative key, for serving files with a sandboxed root. */
function locate(key) {
  resolvePath(key);
  return { root: config.uploads.dir, key };
}

module.exports = { ensureStorageDir, resolvePath, locate, multerStorage, remove };
