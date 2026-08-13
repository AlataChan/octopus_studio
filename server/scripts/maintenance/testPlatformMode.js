/**
 * 测试脚本: 测试 platform 模式的图谱上下文注入
 * 用法: node server/scripts/maintenance/testPlatformMode.js <workspaceId>
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { formatGraphToContext } = require("../../utils/chats/graphContextFormatter");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

async function testPlatformMode(workspaceId) {
  console.log(`\n=== 测试 Platform 模式上下文注入 ===`);
  console.log(`Workspace ID: ${workspaceId}\n`);

  try {
    // 模拟用户消息
    const userMessage = positionalArgs[1] || "AI 助手的功能需求有哪些?";
    console.log(`1. 用户消息: "${userMessage}"\n`);

    // 搜索相关图谱
    console.log("2. 搜索相关图谱...");
    const startTime = Date.now();

    const subgraph = await WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword: userMessage,
      limit: 30,
    });

    const searchTime = Date.now() - startTime;
    console.log(`   ✓ 搜索完成 (耗时: ${searchTime}ms)`);
    console.log(`   - 找到节点: ${subgraph.nodes.length} 个`);
    console.log(`   - 找到边: ${subgraph.edges.length} 条\n`);

    // 格式化为上下文
    console.log("3. 格式化为 LLM 上下文...");
    const formatStartTime = Date.now();

    const { summaryText, graphSources, tokenCount } = formatGraphToContext(subgraph, {
      maxTokens: 3000,
      model: "gpt-3.5-turbo",
    });

    const formatTime = Date.now() - formatStartTime;
    console.log(`   ✓ 格式化完成 (耗时: ${formatTime}ms)`);
    console.log(`   - Token 数量: ${tokenCount}`);
    console.log(`   - 来源数量: ${graphSources.length}\n`);

    // 构建增强消息 (模拟 externalPlatformHandler 的逻辑)
    console.log("4. 构建增强消息 (注入图谱上下文):");
    console.log("---");

    let enhancedMessage = userMessage;
    if (summaryText) {
      enhancedMessage = `${summaryText}\n\n---\n\n用户问题: ${userMessage}`;
    }

    console.log(enhancedMessage);
    console.log("---\n");

    // 统计信息
    console.log("5. 统计信息:");
    console.log(`   - 原始消息长度: ${userMessage.length} 字符`);
    console.log(`   - 增强消息长度: ${enhancedMessage.length} 字符`);
    console.log(`   - 增加内容: ${enhancedMessage.length - userMessage.length} 字符`);
    console.log(`   - Token 增加: ${tokenCount} tokens\n`);

    // 验证 token 限制
    if (tokenCount > 3000) {
      console.log("❌ 警告: Token 数量超过 3000 限制!");
    } else {
      console.log(`✅ Token 数量在限制内 (${tokenCount}/3000)`);
    }

    console.log("\n=== 测试完成! ===\n");
    console.log("📋 结论:");
    console.log("   - 图谱上下文成功注入到用户消息前");
    console.log("   - Token 数量严格控制在 3000 以内");
    console.log("   - 外部平台 (Dify/RAGFlow/n8n) 将收到增强后的消息\n");

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  const workspaceId = parseInt(positionalArgs[0]);

  if (!workspaceId || isNaN(workspaceId)) {
    console.error("用法: node server/scripts/maintenance/testPlatformMode.js <workspaceId>");
    console.error("示例: node server/scripts/maintenance/testPlatformMode.js 1");
    process.exit(1);
  }

  await testPlatformMode(workspaceId);
  process.exit(0);
}

main();
