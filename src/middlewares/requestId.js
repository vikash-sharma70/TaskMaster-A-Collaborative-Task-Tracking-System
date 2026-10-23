'use strict';

const crypto = require('node:crypto');

const HEADER = 'x-request-id';
const SAFE_ID = /^[\w-]{1,128}$/;

/**
 * Propagates (or generates) a correlation id for every request so logs,
 * error responses and upstream proxies can be tied together.
 */
function requestId(req, res, next) {
  const incoming = req.get(HEADER);
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
