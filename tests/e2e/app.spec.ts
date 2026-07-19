import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

// 封装安全的凭据提取函数
function checkGitCredential() {
  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    // 注入非交互式环境变量，强制不进行弹窗
    const output = execSync('git credential fill', {
      input,
      encoding: 'utf8',
      env: {
        ...process.env,
        GCM_INTERACTIVE: 'never',
        GCM_GUI_PROMPT: '0',
        GIT_TERMINAL_PROMPT: '0'
      },
      timeout: 3000
    });
    return { success: true, output: output.replace(/password=.+/g, 'password=[REDACTED]') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

test.describe('E2E Git Credential Isolation Test', () => {
  test.beforeAll(() => {
    console.log('\n[E2E Setup] Testing Git Credentials before loading page...');
    const res = checkGitCredential();
    console.log(`[E2E Setup] Success: ${res.success}. Result:\n`, res.output || res.error);
    expect(res.success).toBe(true);
  });

  test('Should load game page and verify credentials are unaffected', async ({ page }) => {
    // 1. 访问 Vite 自动启动的游戏主页
    await page.goto('/guandan-master/');

    // 2. 确认主页渲染正确（验证网页标题包含“掼蛋”）
    await expect(page).toHaveTitle(/掼蛋/);

    // 3. 在页面加载后再次提取凭据，验证是否存在被 Chrome 锁占用或影响的情况
    console.log('[E2E Test] Testing Git Credentials during test run...');
    const res = checkGitCredential();
    console.log(`[E2E Test] Success: ${res.success}. Result:\n`, res.output || res.error);
    expect(res.success).toBe(true);
  });

  test.afterAll(() => {
    console.log('[E2E Teardown] Testing Git Credentials after closing page...');
    const res = checkGitCredential();
    console.log(`[E2E Teardown] Success: ${res.success}.`);
    expect(res.success).toBe(true);
  });
});
