'use strict';

const { z } = require('zod');
const { DEFAULT_LIMIT, MAX_LIMIT } = require('./pagination');

/** Reusable zod building blocks for request validation. */

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

const idParam = (name = 'id') => z.object({ [name]: objectId }).strict();

const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
};

const email = z.string().trim().toLowerCase().email('Must be a valid email address').max(254);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt only uses the first 72 bytes
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a digit');

/** Optional, nullable trimmed string; empty string is normalised to null. */
const nullableText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

/** Query-string boolean: accepts "true"/"false"/"1"/"0". */
const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

module.exports = {
  objectId,
  idParam,
  paginationQuery,
  email,
  password,
  nullableText,
  queryBoolean,
};
