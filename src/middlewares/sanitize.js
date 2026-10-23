'use strict';

/**
 * Defence-in-depth against NoSQL operator injection.
 *
 * Strips any key that starts with "$" or contains "." from body, params and
 * query before they reach validators. Validation (zod) is the primary guard,
 * this guarantees no operator object can ever slip through to a query.
 */
const MAX_DEPTH = 20;

function clean(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = clean(value[i], depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
      delete value[key];
    } else {
      value[key] = clean(value[key], depth + 1);
    }
  }
  return value;
}

function sanitize(req, res, next) {
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  // Express 5 exposes req.query as a getter, so mutate the parsed object in place.
  if (req.query) clean(req.query);
  next();
}

module.exports = sanitize;
