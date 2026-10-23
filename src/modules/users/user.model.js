'use strict';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const config = require('../../config/env');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Never returned by queries unless explicitly requested with select('+password').
    password: { type: String, required: true, select: false },
    bio: { type: String, trim: true, maxlength: 500, default: null },
    avatarUrl: { type: String, trim: true, maxlength: 2048, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toObject: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

/** @param {string} candidate plain-text password */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Public projection used whenever a user is embedded in another resource. */
userSchema.statics.PUBLIC_FIELDS = 'name email avatarUrl';

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
