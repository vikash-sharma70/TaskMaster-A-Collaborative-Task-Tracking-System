'use strict';

const mongoose = require('mongoose');
const { TEAM_ROLE } = require('../../constants');

/** Upper bound keeps the embedded members array (and the document) small. */
const MAX_TEAM_MEMBERS = 500;

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: Object.values(TEAM_ROLE), default: TEAM_ROLE.MEMBER },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * A team / project. Members are embedded: membership is always read together
 * with the team, team sizes are bounded, and a multikey index on
 * `members.user` makes "teams I belong to" an index lookup.
 */
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [memberSchema],
      validate: {
        validator: (members) => members.length <= MAX_TEAM_MEMBERS,
        message: `A team can have at most ${MAX_TEAM_MEMBERS} members`,
      },
    },
    // Shareable join code; only exposed to team managers.
    inviteCode: { type: String, required: true, unique: true, select: false },
  },
  { timestamps: true },
);

teamSchema.index({ 'members.user': 1, updatedAt: -1 });

module.exports = mongoose.models.Team || mongoose.model('Team', teamSchema);
module.exports.MAX_TEAM_MEMBERS = MAX_TEAM_MEMBERS;
