import { defineConfig } from '@playwright/test';

// Electron checks launch one app instance per test and the app holds a
// single-instance lock, so they run serially. `smoke` is what CI runs;
// `perf` is opt-in (npm run benchmark:startup) because its numbers are only
// meaningful on a quiet machine.
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/electron',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: /.*\.spec\.ts$/ },
    { name: 'perf', testMatch: /.*\.perf\.ts$/ },
  ],
});
