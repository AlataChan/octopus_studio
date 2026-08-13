/**
 * 完整的 Platform 模式测试套件
 * 包含测试 1-6 的自动化执行
 */

const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";

// 测试配置
const WORKSPACE_ID = 1;
const DIFY_ASSISTANT_INSTANCE_ID = "434ad729-df6d-4c88-a0b5-7fc3e37561a7";
const TEST_MESSAGE = "产品需求";

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  log(title, "blue");
  console.log("=".repeat(60) + "\n");
}

async function test1_verifyGraphData() {
  section("测试 1: 验证图谱数据存在");

  try {
    const output = execSync(
      `node server/scripts/maintenance/testGraphSearch.js ${WORKSPACE_ID} "AI"`,
      { encoding: "utf-8", cwd: path.join(__dirname, "../../..") }
    );

    // 解析输出
    const nodeMatch = output.match(/找到节点: (\d+) 个/);
    const edgeMatch = output.match(/找到边: (\d+) 条/);
    const tokenMatch = output.match(/Token 数量: (\d+)/);

    if (nodeMatch && edgeMatch && tokenMatch) {
      const nodes = parseInt(nodeMatch[1]);
      const edges = parseInt(edgeMatch[1]);
      const tokens = parseInt(tokenMatch[1]);

      log(`✅ 测试 1 通过!`, "green");
      log(`   节点数: ${nodes}`, "green");
      log(`   边数: ${edges}`, "green");
      log(`   Token 数: ${tokens}`, "green");

      return { success: true, nodes, edges, tokens };
    } else {
      throw new Error("无法解析测试输出");
    }
  } catch (error) {
    log(`❌ 测试 1 失败: ${error.message}`, "red");
    return { success: false, error: error.message };
  }
}

async function test2_verifyContextInjection() {
  section("测试 2: 验证后端上下文注入");

  try {
    const output = execSync(
      `node server/scripts/maintenance/testPlatformMode.js ${WORKSPACE_ID} "${TEST_MESSAGE}"`,
      { encoding: "utf-8", cwd: path.join(__dirname, "../../..") }
    );

    // 解析输出
    const nodeMatch = output.match(/找到节点: (\d+) 个/);
    const tokenMatch = output.match(/Token 数量: (\d+)/);
    const originalMatch = output.match(/原始消息长度: (\d+) 字符/);
    const enhancedMatch = output.match(/增强消息长度: (\d+) 字符/);

    if (nodeMatch && tokenMatch && originalMatch && enhancedMatch) {
      const nodes = parseInt(nodeMatch[1]);
      const tokens = parseInt(tokenMatch[1]);
      const originalLength = parseInt(originalMatch[1]);
      const enhancedLength = parseInt(enhancedMatch[1]);

      log(`✅ 测试 2 通过!`, "green");
      log(`   节点数: ${nodes}`, "green");
      log(`   Token 数: ${tokens}`, "green");
      log(`   原始消息: ${originalLength} 字符`, "green");
      log(`   增强消息: ${enhancedLength} 字符`, "green");
      log(`   增加内容: ${enhancedLength - originalLength} 字符`, "green");

      return { success: true, nodes, tokens, originalLength, enhancedLength };
    } else {
      throw new Error("无法解析测试输出");
    }
  } catch (error) {
    log(`❌ 测试 2 失败: ${error.message}`, "red");
    return { success: false, error: error.message };
  }
}

async function test3_checkDifyConfig() {
  section("测试 3: 检查 Dify 助手配置");

  try {
    const difyInstance = await prisma.workspace_assistants.findUnique({
      where: { id: DIFY_ASSISTANT_INSTANCE_ID },
      include: { template: true },
    });

    if (!difyInstance) {
      throw new Error("未找到 Dify 助手实例");
    }

    const effectiveMode =
      difyInstance.knowledgeModeOverride ||
      difyInstance.template.knowledgeModeTemplate;

    log(`✅ 测试 3 通过!`, "green");
    log(`   实例 ID: ${difyInstance.id}`, "green");
    log(`   模板名称: ${difyInstance.template.name}`, "green");
    log(`   知识模式: ${effectiveMode}`, "green");
    log(`   状态: ${difyInstance.enabled ? "启用" : "禁用"}`, "green");

    return { success: true, effectiveMode, enabled: difyInstance.enabled };
  } catch (error) {
    log(`❌ 测试 3 失败: ${error.message}`, "red");
    return { success: false, error: error.message };
  }
}

async function test4_manualFrontendTest() {
  section("测试 4-5: 前端测试 (需要手动执行)");

  log("⚠️  测试 4-5 需要手动在浏览器中执行:", "yellow");
  log("", "yellow");
  log("📋 测试 4: 验证 Dify 响应", "yellow");
  log("   1. 打开浏览器: http://localhost:3000", "yellow");
  log("   2. 进入 Workspace '工作'", "yellow");
  log("   3. 选择 Dify 助手", "yellow");
  log("   4. 发送消息: '产品需求'", "yellow");
  log("   5. 观察 Dify 是否正常回答", "yellow");
  log("", "yellow");
  log("📋 测试 5: 对比测试 (关键!)", "yellow");
  log("   1. 打开 Prisma Studio: npx prisma studio --port 5557", "yellow");
  log("   2. 找到 workspace_assistants 表", "yellow");
  log(`   3. 找到 Dify 助手实例 (id: ${DIFY_ASSISTANT_INSTANCE_ID})`, "yellow");
  log("   4. 设置 knowledgeModeOverride = 'none' (关闭图谱)", "yellow");
  log("   5. 发送消息: '产品需求', 记录回答 A", "yellow");
  log("   6. 设置 knowledgeModeOverride = NULL (开启图谱)", "yellow");
  log("   7. 发送相同消息, 记录回答 B", "yellow");
  log("   8. 对比回答 A 和 B 的差异", "yellow");
  log("", "yellow");

  return { success: true, manual: true };
}

async function generateReport(results) {
  section("测试报告");

  const report = `
# Platform 模式测试报告

测试日期: ${new Date().toISOString()}
Workspace ID: ${WORKSPACE_ID}

## 测试结果

### 测试 1: 验证图谱数据存在
- 状态: ${results.test1.success ? "✅ 通过" : "❌ 失败"}
${
  results.test1.success
    ? `- 节点数: ${results.test1.nodes}
- 边数: ${results.test1.edges}
- Token 数: ${results.test1.tokens}`
    : `- 错误: ${results.test1.error}`
}

### 测试 2: 验证后端上下文注入
- 状态: ${results.test2.success ? "✅ 通过" : "❌ 失败"}
${
  results.test2.success
    ? `- 节点数: ${results.test2.nodes}
- Token 数: ${results.test2.tokens}
- 原始消息: ${results.test2.originalLength} 字符
- 增强消息: ${results.test2.enhancedLength} 字符
- 增加内容: ${results.test2.enhancedLength - results.test2.originalLength} 字符`
    : `- 错误: ${results.test2.error}`
}

### 测试 3: 检查 Dify 助手配置
- 状态: ${results.test3.success ? "✅ 通过" : "❌ 失败"}
${
  results.test3.success
    ? `- 知识模式: ${results.test3.effectiveMode}
- 状态: ${results.test3.enabled ? "启用" : "禁用"}`
    : `- 错误: ${results.test3.error}`
}

### 测试 4-5: 前端测试
- 状态: ⚠️  需要手动执行
- 说明: 请按照上述步骤在浏览器中手动测试

## 总结

- 自动化测试: ${results.test1.success && results.test2.success && results.test3.success ? "✅ 全部通过" : "❌ 部分失败"}
- 手动测试: ⚠️  待执行

## 下一步

1. 在浏览器中执行测试 4-5
2. 记录测试结果
3. 对比有无图谱上下文的差异
`;

  const reportPath = path.join(__dirname, "../../tests/test-report.md");
  if (isDryRun) {
    log(`[DRY-RUN] would execute: write report to ${reportPath}`, "yellow");
    console.log(report);
    return;
  }

  fs.writeFileSync(reportPath, report);

  log(`📄 测试报告已生成: ${reportPath}`, "blue");
  console.log(report);
}

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  console.log("\n");
  log("========== Platform 模式完整测试套件 ==========", "blue");
  console.log("\n");

  if (isDryRun) {
    log(
      `[DRY-RUN] would execute: node server/scripts/maintenance/testGraphSearch.js ${WORKSPACE_ID} "AI"`,
      "yellow"
    );
    log(
      `[DRY-RUN] would execute: node server/scripts/maintenance/testPlatformMode.js ${WORKSPACE_ID} "${TEST_MESSAGE}"`,
      "yellow"
    );
    log(
      `[DRY-RUN] would execute: inspect Dify assistant ${DIFY_ASSISTANT_INSTANCE_ID}`,
      "yellow"
    );
    log("[DRY-RUN] would execute: generate platform test report", "yellow");
    return;
  }

  const results = {};

  // 执行测试 1
  results.test1 = await test1_verifyGraphData();

  // 执行测试 2
  results.test2 = await test2_verifyContextInjection();

  // 执行测试 3
  results.test3 = await test3_checkDifyConfig();

  // 测试 4-5 说明
  results.test4 = await test4_manualFrontendTest();

  // 生成报告
  await generateReport(results);

  log("\n========== 测试完成 ==========\n", "blue");
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
