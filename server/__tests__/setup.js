/**
 * Jest 全局测试设置
 * 在每个测试文件执行前运行
 */

// 设置测试环境变量
process.env.NODE_ENV = "test";
process.env.STORAGE_DIR = "__tests__/.storage";
process.env.LOG_DIR = "__tests__/.logs";
process.env.ENABLE_FILE_LOG = "false";

// 禁用 console 输出以保持测试输出干净（可选）
// 如需调试，注释掉以下代码
if (process.env.JEST_SILENT !== "false") {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // 保留 error 输出以便排错
    error: console.error,
  };
}

// 设置测试超时
jest.setTimeout(30000);

// 全局清理
afterAll(async () => {
  const prismaPath = require.resolve("../utils/prisma");
  if (require.cache[prismaPath]) {
    const prisma = require("../utils/prisma");
    await prisma.$disconnect();
  }

  const knowledgeCachePath = require.resolve("../utils/agents/knowledgeCache");
  if (require.cache[knowledgeCachePath]) {
    const { knowledgeCache } = require("../utils/agents/knowledgeCache");
    knowledgeCache.close();
  }
});
