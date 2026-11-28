'use strict';

const BaseRepository = require('./BaseRepository');
const { Department } = require('../models');

/** Departments of the active organisation. */
class DepartmentRepository extends BaseRepository {
  constructor() {
    super(Department, { sortableFields: ['name', 'code'], defaultSort: { name: 1 }, searchableFields: ['name', 'code'] });
  }
}

module.exports = new DepartmentRepository();
