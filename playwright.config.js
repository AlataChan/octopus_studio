/**
 * Playwright 配置文件
 * 用于 Platform 模式端到端测试
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  
  // 测试超时时间
  timeout: 60000,
  
  // 全局设置
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 输出目录
  outputDir: 'tests/results',
});

