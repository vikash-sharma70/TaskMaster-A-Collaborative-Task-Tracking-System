'use strict';

const mongoose = require('mongoose');

/**
 * A login session (one per device / login).
 *
 * Access tokens carry the session id (`sid`), so revoking a session (logout)
 * immediately invalidates every access token issued for it - stateless JWTs
 * alone cannot offer a real logout. The refresh token is stored only as a
 * SHA-256 hash and is rotated on every use; presenting an already rotated
 * token is treated as theft and revokes the session.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: Date.now },
    userAgent: { type: String, maxlength: 512, default: null },
    ip: { type: String, maxlength: 64, default: null },
  },
  { timestamps: true },
);

// MongoDB removes sessions automatically once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);
