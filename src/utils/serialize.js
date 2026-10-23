'use strict';

const mongoose = require('mongoose');

/**
 * Converts Mongoose documents / lean objects into the public JSON shape:
 *  - `_id` becomes `id` (string)
 *  - `__v` is removed
 *  - ObjectIds become strings
 * Works recursively, so populated relations are normalised as well. Using one
 * serializer for both hydrated documents and `.lean()` results keeps every
 * response consistent while allowing hot read paths to skip hydration.
 */
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (value instanceof mongoose.Document) return serialize(value.toObject());
  if (typeof value !== 'object') return value;
  if (value.constructor !== Object && value.constructor !== undefined) return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === '__v') continue;
    if (key === '_id') {
      out.id = serialize(val);
      continue;
    }
    out[key] = serialize(val);
  }
  return out;
}

module.exports = serialize;
