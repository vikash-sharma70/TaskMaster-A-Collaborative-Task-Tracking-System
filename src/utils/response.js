'use strict';

const serialize = require('./serialize');

/**
 * Uniform success envelope:
 *   { success: true, data, meta? }
 * Errors use { success: false, error } (see middlewares/errorHandler.js).
 */
function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data: serialize(data) };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function sendCreated(res, data) {
  return sendSuccess(res, data, { status: 201 });
}

function sendNoContent(res) {
  return res.status(204).end();
}

module.exports = { sendSuccess, sendCreated, sendNoContent };
