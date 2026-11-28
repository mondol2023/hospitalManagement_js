'use strict';

const BaseRepository = require('./BaseRepository');
const { Organization } = require('../models');

/** Organisations are platform-level: no tenant filter applies. */
class OrganizationRepository extends BaseRepository {
  constructor() {
    super(Organization, { sortableFields: ['name', 'code', 'status'], searchableFields: ['name', 'code', 'subdomain'] });
  }
}

module.exports = new OrganizationRepository();
