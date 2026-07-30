'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const toJSONPlugin = require('./plugins/toJSON');
const { ROLE_VALUES, ROLES, AUTH_PROVIDERS } = require('../utils/constants');

/**
 * Fixes against the original `Users.js`:
 *  - passwords were stored however the caller supplied them; hashing lived in
 *    the controller and was therefore skipped by every other write path
 *  - `password` was selectable by default, so `User.find()` returned hashes
 *  - `outhProvider` was a typo
 *  - the role enum disagreed with the roles the routes actually granted
 *  - `unique: true` on email without a normalising setter allowed
 *    `A@x.com` and `a@x.com` to coexist as distinct accounts
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      // Never returned unless a query explicitly asks with `.select('+password')`.
      select: false,
      private: true,
    },
    role: {
      type: String,
      required: true,
      enum: { values: ROLE_VALUES, message: '`{VALUE}` is not a valid role' },
      default: ROLES.PATIENT,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'Invalid phone number'],
    },
    address: { type: String, trim: true, maxlength: 500 },
    profilePic: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: 'local',
    },
    lastLoginAt: { type: Date },
    /**
     * Any token issued before this instant is rejected. Bumping it is how
     * "log out everywhere" and forced re-auth after a password change work
     * without keeping server-side session state.
     */
    tokensValidFrom: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
// `email` already has a unique index from the field definition.
// Analytics counts users by role; the routes list users filtered by role.
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
// Supports name/email search without a collection scan.
userSchema.index({ name: 'text', email: 'text' });

// --- Hooks -----------------------------------------------------------------

/**
 * Hash on save. Living here rather than in the controller means *every* write
 * path is covered, which is what makes `userService.update` safe.
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
  // Invalidate outstanding tokens whenever credentials change.
  if (!this.isNew) this.tokensValidFrom = new Date();
  next();
});

/** Translate the driver's duplicate-key error into a clean 409 upstream. */
userSchema.post('save', function handleDuplicate(err, doc, next) {
  if (err?.code === 11000) {
    return next(new Error('A user with that email already exists'));
  }
  return next(err);
});

// --- Methods ---------------------------------------------------------------

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

/**
 * A token is stale if it was issued before the last credential change. JWT `iat`
 * is in seconds, so compare at second resolution.
 */
userSchema.methods.isTokenStale = function isTokenStale(issuedAtSeconds) {
  if (!this.tokensValidFrom) return false;
  return issuedAtSeconds * 1000 < Math.floor(this.tokensValidFrom.getTime() / 1000) * 1000;
};

module.exports = mongoose.model('User', userSchema);
