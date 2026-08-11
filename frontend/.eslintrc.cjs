/* eslint-env node */

const fs = require('node:fs');
const path = require('node:path');

/**
 * The feature slices, read from disk so a new one is covered the day it is
 * created rather than the day somebody remembers to edit this file.
 */
const FEATURES = fs
  .readdirSync(path.join(__dirname, 'src/features'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/**
 * The rule that matters most here is `import/no-restricted-paths`.
 *
 * ARCHITECTURE.md §4 says a feature may import from `shared/` freely but never
 * reach into another feature's internals. That is a dependency-inversion rule,
 * and a rule people have to *remember* is a rule that decays the first busy
 * week. Encoding it here makes a cross-feature import a CI failure instead of a
 * code-review argument.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'postcss.config.js'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh', 'import'],
  settings: {
    'import/resolver': {
      typescript: { project: './tsconfig.json' },
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    },
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        // `_thing` is the deliberate discard, and `const { secret, ...rest }`
        // is how a field is dropped from a payload — both are the variable
        // being unused *on purpose*, which is the opposite of the mistake this
        // rule exists to catch.
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            // §2 dependency inversion: only shared/api/client.ts knows axios
            // exists. Everything above it depends on the typed wrapper.
            name: 'axios',
            message:
              'Import the shared HTTP client from @/shared/api/client instead of using axios directly.',
          },
        ],
      },
    ],
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // One zone per slice, because the rule resolves `except` relative to
          // `from` and has no way to say "a directory may import itself". A
          // single `features -> features` zone therefore also forbids a slice
          // its own `./model/...`, which is not the rule ARCHITECTURE.md §4
          // states. Naming the importing slices instead keeps intra-slice
          // imports free and leaves exactly one legal door in: `index.ts`.
          ...FEATURES.map((feature) => ({
            target: `./src/features/!(${feature})/**/*`,
            from: `./src/features/${feature}`,
            except: ['./index.ts'],
            message: `Import from '@/features/${feature}' — a feature’s internals are private to it (ARCHITECTURE.md §4).`,
          })),
          {
            target: './src/shared',
            from: './src/features',
            message: 'shared/ must not depend on a feature — dependencies point inward only.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
      env: { node: true },
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
