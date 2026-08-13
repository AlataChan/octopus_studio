/**
 * Jest 测试框架配置 - Collector 模块
 * @see https://jestjs.io/docs/configuration
 *
 * 注意：由于 yarn workspace 的模块解析问题，建议从项目根目录运行测试：
 * yarn test:collector 或 yarn test:collector:ocr
 */

module.exports = {
  // 测试环境
  testEnvironment: "node",

  // 测试文件匹配规则
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.js",
    "<rootDir>/**/__tests__/**/*.spec.js",
  ],

  // 覆盖率收集
  collectCoverageFrom: [
    "utils/**/*.js",
    "!**/node_modules/**",
    "!**/__tests__/**",
  ],

  // 覆盖率报告目录
  coverageDirectory: "coverage",

  // 覆盖率报告格式
  coverageReporters: ["text", "lcov", "html"],

  // 测试超时时间（毫秒）- OCR 测试需要较长时间
  testTimeout: 120000,

  // 是否显示详细测试结果
  verbose: true,

  // 忽略的路径
  testPathIgnorePatterns: [
    "/node_modules/",
  ],

  // 清理 mock 调用和实例
  clearMocks: true,

  // 在测试间重置 mock 状态
  resetMocks: true,

  // 转换 ESM 模块
  transformIgnorePatterns: [
    "/node_modules/(?!(sharp)/)",
  ],

  // 模块解析目录 - 从根目录运行时，node_modules 在当前目录
  moduleDirectories: [
    "node_modules",
  ],

  // 设置模块路径别名，让 collector 内部的相对引用正常工作
  moduleNameMapper: {
    "^utils/(.*)$": "<rootDir>/utils/$1",
  },
};

