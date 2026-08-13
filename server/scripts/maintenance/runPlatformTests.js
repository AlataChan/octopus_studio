/**
 * Platform 模式快速测试脚本
 * 自动执行测试 1-2,并提供测试 3-6 的指引
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  console.log("\n========== Platform 模式测试套件 ==========\n");

  // 获取 workspace ID
  const workspaceId = parseInt(positionalArgs[0] || "1");
  
  console.log(`📍 测试 Workspace ID: ${workspaceId}\n`);

  // 测试 1: 验证图谱数据
  console.log("✅ 测试 1: 验证图谱数据存在");
  console.log("   命令: node server/scripts/maintenance/testGraphSearch.js", workspaceId, '"AI"');
  console.log("   预期: 找到至少 5 个节点\n");

  // 测试 2: 验证后端上下文注入
  console.log("✅ 测试 2: 验证后端上下文注入");
  console.log("   命令: node server/scripts/maintenance/testPlatformMode.js", workspaceId, '"产品需求"');
  console.log("   预期: Token 数量 < 3000, 消息增强成功\n");

  console.log("---\n");

  if (isDryRun) {
    console.log(
      "[DRY-RUN] would execute:",
      `inspect Dify assistant configuration for workspace ${workspaceId}`
    );
    console.log("[DRY-RUN] would execute:", "print frontend/manual test plan");
    console.log("========================================\n");
    console.log("📚 完整测试计划: docs/DIFY_PLATFORM_MODE_TEST_PLAN.md");
    console.log("📊 测试结果总结: docs/DIFY_PLATFORM_MODE_TEST_SUMMARY.md\n");
    return;
  }

  // 测试 3-6: 前端测试指引
  console.log("🔍 测试 3-6: 前端测试 (需要手动执行)\n");

  console.log("📋 测试 3: 验证消息注入 (后端日志)");
  console.log("   步骤:");
  console.log("   1. 启动后端: cd server && yarn dev");
  console.log("   2. 在前端发送消息: '产品需求'");
  console.log("   3. 查看日志确认图谱上下文注入\n");

  console.log("📋 测试 4: 验证 Dify 响应 (前端对话)");
  console.log("   步骤:");
  console.log("   1. 启动前端: cd frontend && yarn dev");
  console.log("   2. 进入 Workspace '工作'");
  console.log("   3. 选择 Dify 助手");
  console.log("   4. 发送消息: '产品需求'");
  console.log("   5. 观察 Dify 是否正常回答\n");

  console.log("📋 测试 5: 对比测试 (关键!)");
  console.log("   步骤:");
  console.log("   1. 打开 Prisma Studio: npx prisma studio --port 5557");
  console.log("   2. 找到 workspace_assistants 表");
  console.log("   3. 找到 Dify 助手实例 (id: 434ad729-df6d-4c88-a0b5-7fc3e37561a7)");
  console.log("   4. 设置 knowledgeModeOverride = 'none' (关闭图谱)");
  console.log("   5. 发送消息: '产品需求', 记录回答 A");
  console.log("   6. 设置 knowledgeModeOverride = NULL (开启图谱)");
  console.log("   7. 发送相同消息, 记录回答 B");
  console.log("   8. 对比回答 A 和 B 的差异\n");

  console.log("📋 测试 6: 验证 Token 控制 (可选)");
  console.log("   步骤:");
  console.log("   1. 创建更多图谱节点 (50+ 个)");
  console.log("   2. 发送消息触发搜索");
  console.log("   3. 查看日志中的 Token 数量");
  console.log("   4. 验证 Token < 3000\n");

  console.log("---\n");

  // 检查 Dify 助手配置
  console.log("🔧 检查 Dify 助手配置...\n");

  const difyInstance = await prisma.workspace_assistants.findFirst({
    where: {
      workspaceId: workspaceId,
      template: {
        platformType: "dify",
      },
    },
    include: {
      template: true,
    },
  });

  if (!difyInstance) {
    console.log("❌ 未找到 Dify 助手实例!");
    console.log("   请先在 Workspace 中安装 Dify 助手\n");
    return;
  }

  console.log("✅ Dify 助手配置:");
  console.log(`   实例 ID: ${difyInstance.id}`);
  console.log(`   模板名称: ${difyInstance.template.name}`);
  console.log(`   知识模式 (模板): ${difyInstance.template.knowledgeModeTemplate || "未设置"}`);
  console.log(`   知识模式 (覆盖): ${difyInstance.knowledgeModeOverride || "继承模板"}`);
  console.log(`   状态: ${difyInstance.enabled ? "启用" : "禁用"}\n`);

  const effectiveMode = difyInstance.knowledgeModeOverride || difyInstance.template.knowledgeModeTemplate;
  
  if (effectiveMode === "platform") {
    console.log("✅ 当前知识模式: platform (图谱上下文注入已启用)\n");
  } else if (effectiveMode === "none") {
    console.log("⚠️  当前知识模式: none (图谱上下文注入已禁用)\n");
    console.log("   如需测试 Platform 模式,请在 Prisma Studio 中:");
    console.log("   设置 knowledgeModeOverride = NULL\n");
  } else {
    console.log(`⚠️  当前知识模式: ${effectiveMode}\n`);
  }

  console.log("========================================\n");
  console.log("📚 完整测试计划: docs/DIFY_PLATFORM_MODE_TEST_PLAN.md");
  console.log("📊 测试结果总结: docs/DIFY_PLATFORM_MODE_TEST_SUMMARY.md\n");
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
