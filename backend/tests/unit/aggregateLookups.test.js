'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src');

/**
 * The plugin cannot filter a foreign collection inside `$lookup`, `$unionWith`
 * or `$graphLookup`. Each one must join from an already-filtered document, so a
 * new one needs a reviewer: extend this list only after checking that.
 */
const ALLOWED = {
  'repositories/medicalRecordRepository.js': ['$lookup'],
};

const STAGE = /\$(lookup|unionWith|graphLookup)\b/g;

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

// Comments may mention the stages; only code counts.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

it('the only $lookup, $unionWith and $graphLookup stages in src/ are the allowlisted ones', () => {
  const found = {};
  for (const file of files(SRC)) {
    const hits = stripComments(fs.readFileSync(file, 'utf8')).match(STAGE);
    if (hits) found[path.relative(SRC, file).replace(/\\/g, '/')] = [...new Set(hits)].sort();
  }
  expect(found).toEqual(ALLOWED);
});
