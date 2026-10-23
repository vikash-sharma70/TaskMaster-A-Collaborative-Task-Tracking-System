'use strict';

const crypto = require('node:crypto');

/** Cryptographically secure, URL-safe random token. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** One-way SHA-256 digest used to store high-entropy tokens at rest. */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison (avoids timing side channels). */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Short human-shareable code (e.g. team invite codes). Unambiguous alphabet. */
function shortCode(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

module.exports = { randomToken, sha256, safeEqual, shortCode };
