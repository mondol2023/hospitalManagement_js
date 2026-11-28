'use strict';

const mongoose = require('mongoose');
require('../../src/models');

const models = () => Object.values(mongoose.models).filter((m) => m.modelName !== 'Organization');
const uniqueIndexes = (model) =>
  model.schema.indexes().filter(([, options]) => options && options.unique);

// Invoice numbers are organisation-wide by design (spec 4.5).
const ORG_WIDE_UNIQUE = new Set(['Bill organization,invoiceNumber']);

describe('tenancy linter', () => {
  it('every registered model except Organization has the tenantScoped plugin', () => {
    const missing = models().filter((m) => typeof m.tenantFields !== 'function').map((m) => m.modelName);
    expect(missing).toEqual([]);
  });

  it('every unique index leads with organization', () => {
    const bad = [];
    models().forEach((m) =>
      uniqueIndexes(m).forEach(([keys]) => {
        if (Object.keys(keys)[0] !== 'organization') bad.push(`${m.modelName} ${JSON.stringify(keys)}`);
      })
    );
    expect(bad).toEqual([]);
  });

  it('no field definition declares unique: true', () => {
    const bad = [];
    Object.values(mongoose.models).forEach((m) =>
      Object.entries(m.schema.paths).forEach(([path, type]) => {
        if (type.options && type.options.unique) bad.push(`${m.modelName}.${path}`);
      })
    );
    expect(bad).toEqual([]);
  });

  it('branch-scoped models list branch second in every unique index', () => {
    const bad = [];
    models()
      .filter((m) => m.tenantFields().includes('branch'))
      .forEach((m) =>
        uniqueIndexes(m).forEach(([keys]) => {
          const key = Object.keys(keys);
          if (key[1] !== 'branch' && !ORG_WIDE_UNIQUE.has(`${m.modelName} ${key}`)) bad.push(`${m.modelName} ${JSON.stringify(keys)}`);
        })
      );
    expect(bad).toEqual([]);
  });
});
