/**
 * 测试 Chat 流程中的上下文分配与图谱总结集成
 * 
 * 用法:
 * node server/scripts/maintenance/testChatIntegration.js [workspaceId] [message]
 * 
 * 示例:
 * node server/scripts/maintenance/testChatIntegration.js 1 "产品需求"
 */

const { PrismaClient } = require("@prisma/client");
const { calculateContextAllocation } = require("../../utils/chats/contextAllocation");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { summarizeGraphContext } = require("../../utils/chats/graphSummarization");

const prisma = new PrismaClient();

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

async function main() {
  const workspaceId = parseInt(process.argv[2] || "1");
  const message = process.argv[3] || "产品需求";
  
  console.log("\n");
  log("========== Chat 流程集成测试 ==========", "blue");
  console.log("\n");
  
  log(`Workspace ID: ${workspaceId}`, "blue");
  log(`消息: "${message}"`, "blue");
  console.log("\n");
  
  // 1. 获取 Workspace 信息
  section("步骤 1: 获取 Workspace 信息");
  
  const workspace = await prisma.workspaces.findUnique({
    where: { id: workspaceId },
  });
  
  if (!workspace) {
    log(`❌ Workspace ${workspaceId} 不存在`, "red");
    return;
  }
  
  log(`✓ Workspace: ${workspace.name}`, "green");
  log(`  模型: ${workspace.chatModel || "default"}`, "green");
  log(`  Provider: ${workspace.chatProvider || "default"}`, "green");
  
  // 2. 计算上下文窗口分配
  section("步骤 2: 计算上下文窗口分配");
  
  const allocation = calculateContextAllocation({
    modelName: workspace.chatModel,
    hasGraphContext: true,
    hasVectorContext: true,
  });
  
  log(`模型: ${workspace.chatModel}`, "blue");
  log(`上下文窗口: ${allocation.contextWindow} tokens`, "blue");
  log(`总预算: ${allocation.totalBudget} tokens (70%)`, "blue");
  console.log("\n");
  log("分配结果:", "yellow");
  log(`  对话历史: ${allocation.allocation.conversationHistory} tokens`, "green");
  log(`  向量检索: ${allocation.allocation.vectorRAG} tokens`, "green");
  log(`  图谱上下文: ${allocation.allocation.graphContext} tokens`, "green");
  
  // 3. 搜索图谱
  section("步骤 3: 搜索图谱");
  
  const graphStartTime = Date.now();
  const subgraph = await WorkspaceGraph.searchSubgraph({
    workspaceId,
    keyword: message,
    limit: 50,
  });
  const graphSearchTime = Date.now() - graphStartTime;
  
  log(`✓ 搜索完成 (耗时: ${graphSearchTime}ms)`, "green");
  log(`  节点数量: ${subgraph.nodes.length}`, "green");
  log(`  边数量: ${subgraph.edges.length}`, "green");
  
  if (subgraph.nodes.length === 0) {
    log("\n⚠️  未找到任何节点", "yellow");
    return;
  }
  
  // 4. 总结图谱上下文
  section("步骤 4: 总结图谱上下文");
  
  const summaryResult = summarizeGraphContext(
    subgraph,
    message,
    allocation.allocation.graphContext
  );
  
  log(`Token 数量: ${summaryResult.tokenCount} / ${allocation.allocation.graphContext}`, "blue");
  log(`节点数量: ${summaryResult.nodeCount}`, "blue");
  log(`边数量: ${summaryResult.edgeCount}`, "blue");
  console.log("\n");
  log("总结内容:", "yellow");
  console.log(summaryResult.summary);
  
  // 5. 验证集成
  section("步骤 5: 验证集成");
  
  const checks = [
    {
      name: "上下文窗口分配正确",
      pass: allocation.totalBudget > 0 && allocation.allocation.graphContext > 0,
    },
    {
      name: "图谱搜索成功",
      pass: subgraph.nodes.length > 0,
    },
    {
      name: "图谱总结成功",
      pass: summaryResult.summary.length > 0,
    },
    {
      name: "Token 数量在预算内",
      pass: summaryResult.tokenCount <= allocation.allocation.graphContext,
    },
    {
      name: "搜索性能达标 (< 100ms)",
      pass: graphSearchTime < 100,
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  checks.forEach(check => {
    if (check.pass) {
      log(`✅ ${check.name}`, "green");
      passed++;
    } else {
      log(`❌ ${check.name}`, "red");
      failed++;
    }
  });
  
  log(`\n总计: ${passed} / ${checks.length} 通过`, failed === 0 ? "green" : "red");
  
  if (failed === 0) {
    log("\n✅ 所有检查通过! Chat 流程集成成功!", "green");
  } else {
    log(`\n❌ ${failed} 个检查失败`, "red");
  }
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

