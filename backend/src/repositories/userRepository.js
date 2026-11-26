'use strict';

const BaseRepository = require('./BaseRepository');
const { User } = require('../models');

class UserRepository extends BaseRepository {
  constructor() {
    super(User, {
      sortableFields: ['name', 'email', 'role', 'lastLoginAt'],
      searchableFields: ['name', 'email'],
    });
  }

  /**
   * Login path. Returns a hydrated document (not lean) with the password
   * included, because the caller needs `comparePassword` and `isTokenStale`.
   *
   * Email is normalised here rather than at each call site — the schema
   * lowercases on write, so a raw lookup with mixed case silently misses.
   */
  findByEmailWithPassword(email) {
    return this.model
      .findOne({ email: String(email).toLowerCase().trim() })
      .select('+password')
      .exec();
  }

  /**
   * Password-change path. `password` is `select: false`, so a plain `findById`
   * comes back without the hash and `comparePassword` would silently compare
   * against `undefined` — hence an explicit method rather than a flag on the
   * generic finder.
   */
  findByIdWithPassword(id) {
    return this.model.findById(id).select('+password').exec();
  }

  emailExists(email) {
    return this.exists({ email: String(email).toLowerCase().trim() });
  }

  /**
   * Used on every authenticated request, so it is projected down to just the
   * fields the auth middleware needs and kept lean.
   */
  findActiveById(id) {
    return this.model
      .findOne({ _id: id, isActive: true })
      .select('name email role isActive tokensValidFrom')
      .lean()
      .exec();
  }

  /** Records a successful login without touching `tokensValidFrom`. */
  touchLogin(id) {
    return this.model.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } }).exec();
  }

  /** "Log out everywhere": invalidates every outstanding token for the user. */
  revokeTokens(id) {
    return this.model.updateOne({ _id: id }, { $set: { tokensValidFrom: new Date() } }).exec();
  }

  /**
   * Active accounts matching `filter`. Takes a session so a guard such as "never
   * remove the last administrator" can count inside the transaction that writes.
   */
  countActive(filter = {}, { session } = {}) {
    return this.model
      .countDocuments({ ...filter, isActive: true })
      .session(session || null)
      .exec();
  }

  countByRole() {
    return this.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
  }
}

module.exports = new UserRepository();
