import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    // 强制使用沙箱 Chromium，不共享本机用户 profile
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    headless: !process.env.CI // 本地运行时显示浏览器画面，CI环境自动无头
  },
  // 自动拉起 Vite 本地服务
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
