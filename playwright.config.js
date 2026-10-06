import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (npm run e2e): every world built in a real browser, see tests/e2e/.
// Software GL (SwiftShader): the same pixels and draw calls on every machine, GPU or not.
const PORT = Number(process.env.E2E_PORT) || 5199; // E2E_PORT: a second checkout running e2e at the same time

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000, // building a world with software GL takes a while
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0, // a failure is a failure: no retrying flakes away
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  // Golden files: tests/e2e/golden/<world>.json, the same on every platform.
  snapshotPathTemplate: '{testDir}/golden/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /mobile\.spec\.js/ },
    // A phone (touch, a coarse pointer, a tall narrow screen): a smoke test only (tests/e2e/mobile.spec.js).
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
