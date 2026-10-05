import { defineConfig } from 'vitest/config';

// Unit tests: pure logic, run in Node (npm test). The browser end-to-end tests are in tests/e2e/
// (Playwright, npm run e2e).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // Keep transformed modules on disk (node_modules/.vitest-cache, keyed on file contents) so the
    // next run skips transforming them: ~4.3 → ~3.3 s locally. npm ci wipes it with node_modules.
    fsModuleCache: true,
  },
});
