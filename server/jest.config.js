/**
 * Jest 测试框架配置
 * @see https://jestjs.io/docs/configuration
 */

module.exports = {
  // 测试环境
  testEnvironment: "node",

  // 测试文件匹配规则
  testMatch: [
    "**/__tests__/**/*.test.js",
    "**/__tests__/**/*.spec.js",
  ],

  // 覆盖率收集 - 仅收集核心模块
  collectCoverageFrom: [
    "models/user.js",
    "models/workspace.js",
    "models/assistantTemplate.js",
    "models/workspaceAssistant.js",
    "models/systemPromptVariables.js",
    "middleware/rateLimiter.js",
    "middleware/requestId.js",
    "!**/node_modules/**",
    "!**/__tests__/**",
  ],

  // 覆盖率报告目录
  coverageDirectory: "coverage",

  // 覆盖率报告格式
  coverageReporters: ["text", "lcov", "html"],

  // 最低覆盖率阈值 - 针对核心模块
  // 当前基线：30%，目标：逐步提升到 80%
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 25,
      lines: 25,
      statements: 25,
    },
  },

  // 测试超时时间（毫秒）
  testTimeout: 30000,

  // 是否显示详细测试结果
  verbose: true,

  // 设置根目录
  rootDir: ".",

  // 模块路径别名
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },

  // 在每个测试文件执行前运行的配置
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.js"],

  // 忽略的路径
  testPathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/setup.js",
    "/__tests__/utils/testHelpers.js",
  ],

  // 清理 mock 调用和实例
  clearMocks: true,

  // 在测试间重置 mock 状态
  resetMocks: true,
};

