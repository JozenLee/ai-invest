import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 600000, // 10分钟，足够完成包含AI生成的完整流程
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'cd data-service && python main.py',
      port: 8000,
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
