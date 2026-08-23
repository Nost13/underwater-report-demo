import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
