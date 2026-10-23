'use strict';

const mongoose = require('mongoose');
const { INVITATION_STATUS, TEAM_ROLE } = require('../../constants');

/**
 * Invitation of an email address to a team. Invitations are bound to the email
 * (not a user id) so people who have not registered yet can be invited; the
 * invitation shows up for them as soon as they sign up with that address.
 */
const invitationSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: {
      type: String,
      enum: [TEAM_ROLE.ADMIN, TEAM_ROLE.MEMBER],
      default: TEAM_ROLE.MEMBER,
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(INVITATION_STATUS),
      default: INVITATION_STATUS.PENDING,
    },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// At most one pending invitation per (team, email).
invitationSchema.index(
  { team: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: INVITATION_STATUS.PENDING } },
);
invitationSchema.index({ email: 1, status: 1, expiresAt: 1 });
invitationSchema.index({ team: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Invitation || mongoose.model('Invitation', invitationSchema);
