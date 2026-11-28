'use strict';

// Pins Task 15: the tenancy guide exists, covers what developers need, and
// every file or symbol it names is real.
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(backend, p), 'utf8');

describe('docs/TENANCY.md', () => {
  const docPath = '../docs/TENANCY.md';
  let doc;
  beforeAll(() => {
    doc = read(docPath);
  });

  it.each([
    'runAs',
    'withoutTenant',
    'forBranch',
    'branches: \'all\'',
    'tenantScoped',
    'modelsAreTenantScoped',
    'buildKey',
    'buildPlatformKey',
    'org:<organizationId>:staff',
    'hms:v1:t:<organizationId>',
  ])('mentions %s', (term) => {
    expect(doc).toContain(term);
  });

  it('has a section per topic', () => {
    for (const h of ['## Context', '## Jobs and scripts', '## Bypass', '## Adding a model', '## Cache keys', '## Socket rooms']) {
      expect(doc).toContain(h);
    }
  });

  it('lists every withoutTenant allowlist file from the ESLint config', () => {
    const lint = JSON.parse(read('.eslintrc.json'));
    const files = lint.overrides
      .flatMap((o) => o.files)
      .filter((f) => f.startsWith('src/'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(doc).toContain(f);
  });

  it('only references repo paths that exist', () => {
    const refs = [...doc.matchAll(/`((?:src|scripts|tests)\/[\w./-]+\.js)`/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(fs.existsSync(path.join(backend, r))).toBe(true);
  });
});

describe('env and README wiring', () => {
  it.each([
    'ROOT_DOMAIN',
    'SEED_ORG_NAME',
    'SEED_ORG_CODE',
    'SEED_BRANCH_NAME',
    'SEED_BRANCH_CODE',
    'PLATFORM_ADMIN_PASSWORD',
  ])('.env.example lists %s', (name) => {
    expect(read('.env.example')).toMatch(new RegExp(`^#?\\s*${name}=`, 'm'));
  });

  it('README links the tenancy guide', () => {
    expect(read('README.md')).toContain('docs/TENANCY.md');
  });
});
