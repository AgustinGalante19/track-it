import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  globalTeardown: './scripts/performance-teardown.ts',
  maxFailures: 1,
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'off', actionTimeout: 15_000 },
  webServer: {
    command: 'node scripts/performance-harness.mjs',
    url: 'http://127.0.0.1:5174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
