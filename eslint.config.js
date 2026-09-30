import js from '@eslint/js';
import globals from 'globals';

// Catches bugs, not style: ESLint's recommended rules plus a few that matter in this code base.
// Formatting is left as it is (2 spaces, single quotes, long lines are fine).
export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
      'no-shadow-restricted-names': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    // Node scripts and tool configs.
    files: ['scripts/**', 'tests/**', 'tools/**', '*.config.js', '*.config.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
