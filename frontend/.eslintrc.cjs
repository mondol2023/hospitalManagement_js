/* eslint-env node */

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
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
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
          {
            target: './src/features',
            from: './src/features',
            except: ['./*/index.ts', './*/api.ts', './*/types.ts'],
            message:
              'Cross-feature imports must go through the other feature’s public index.ts (ARCHITECTURE.md §4).',
          },
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
