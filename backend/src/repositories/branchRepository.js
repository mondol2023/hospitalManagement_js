'use strict';

const BaseRepository = require('./BaseRepository');
const { Branch } = require('../models');

/** Branches of the active organisation (tenant filter comes from the plugin). */
class BranchRepository extends BaseRepository {
  constructor() {
    super(Branch, { sortableFields: ['name', 'code', 'createdAt'], searchableFields: ['name', 'code'] });
  }

  /** How many of these ids exist in the active organisation. */
  countByIds(ids) {
    return this.model.countDocuments({ _id: { $in: ids } }).exec();
  }
}

module.exports = new BranchRepository();
