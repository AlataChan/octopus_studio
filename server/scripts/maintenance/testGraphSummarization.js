/**
 * 测试图谱上下文总结算法
 *
 * 用法:
 * node server/scripts/maintenance/testGraphSummarization.js [workspaceId] [keyword]
 *
 * 示例:
 * node server/scripts/maintenance/testGraphSummarization.js 1 "AI"
 */

const { PrismaClient } = require("@prisma/client");
const { summarizeGraphContext } = require("../../utils/chats/graphSummarization");
const { WorkspaceGraph } = require("../../models/workspaceGraph");

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
  const keyword = process.argv[3] || "AI";

  console.log("\n");
  log("========== 图谱上下文总结算法测试 ==========", "blue");
  console.log("\n");

  log(`Workspace ID: ${workspaceId}`, "blue");
  log(`搜索关键词: "${keyword}"`, "blue");
  console.log("\n");

  // 1. 搜索图谱
  section("步骤 1: 搜索图谱");

  const startTime = Date.now();
  const subgraph = await WorkspaceGraph.searchSubgraph({
    workspaceId,
    keyword,
    limit: 50,
  });
  const searchTime = Date.now() - startTime;

  log(`✓ 搜索完成 (耗时: ${searchTime}ms)`, "green");
  log(`- 找到节点: ${subgraph.nodes.length} 个`, "green");
  log(`- 找到边: ${subgraph.edges.length} 条`, "green");

  if (subgraph.nodes.length === 0) {
    log("\n⚠️  未找到任何节点,请先创建测试数据", "yellow");
    log("运行: node server/scripts/maintenance/testGraphData.js 1", "yellow");
    return;
  }

  // 2. 测试不同的 Token 限制
  section("步骤 2: 测试不同的 Token 限制");

  const tokenLimits = [500, 1000, 2000, 3000];

  for (const maxTokens of tokenLimits) {
    log(`\n测试 Token 限制: ${maxTokens}`, "yellow");

    const result = summarizeGraphContext(subgraph, keyword, maxTokens);

    log(`  Token 数量: ${result.tokenCount} / ${maxTokens}`, result.tokenCount <= maxTokens ? "green" : "red");
    log(`  节点数量: ${result.nodeCount}`, "green");
    log(`  边数量: ${result.edgeCount}`, "green");

    if (result.tokenCount > maxTokens) {
      log(`  ❌ 超出 Token 限制!`, "red");
    } else {
      log(`  ✅ 在 Token 限制内`, "green");
    }
  }

  // 3. 显示完整总结 (3000 tokens)
  section("步骤 3: 完整总结 (3000 tokens)");

  const fullResult = summarizeGraphContext(subgraph, keyword, 3000);

  log(`Token 数量: ${fullResult.tokenCount}`, "blue");
  log(`节点数量: ${fullResult.nodeCount}`, "blue");
  log(`边数量: ${fullResult.edgeCount}`, "blue");
  console.log("\n");
  log("总结内容:", "yellow");
  console.log(fullResult.summary);

  // 4. 验证总结质量
  section("步骤 4: 验证总结质量");

  const checks = [
    {
      name: "Token 数量在限制内",
      pass: fullResult.tokenCount <= 3000,
    },
    {
      name: "包含节点信息",
      pass: fullResult.nodeCount > 0,
    },
    {
      name: "包含边信息",
      pass: fullResult.edgeCount > 0,
    },
    {
      name: "总结不为空",
      pass: fullResult.summary.length > 0,
    },
    {
      name: "包含关键词",
      pass: fullResult.summary.toLowerCase().includes(keyword.toLowerCase()),
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
    log("\n✅ 所有检查通过!", "green");
  } else {
    log(`\n❌ ${failed} 个检查失败`, "red");
  }

  // 5. 性能统计
  section("步骤 5: 性能统计");

  log(`搜索耗时: ${searchTime}ms`, "blue");
  log(`总结 Token 数: ${fullResult.tokenCount}`, "blue");
  log(`压缩比: ${((fullResult.nodeCount + fullResult.edgeCount) / fullResult.tokenCount * 100).toFixed(2)}% (节点+边 / Token)`, "blue");
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

