import { defineConfig } from 'vitest/config';

// Unit tests: pure logic, run in Node (npm test). The browser end-to-end tests are in tests/e2e/
// (Playwright, npm run e2e).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
