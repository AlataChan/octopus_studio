/**
 * 测试真实 Dify/RAGFlow/n8n 环境
 * 
 * 使用方法:
 * 1. 配置环境变量或直接修改下方的配置
 * 2. 运行: node server/scripts/maintenance/testRealPlatform.js <workspaceId> <platform> <message>
 * 
 * 示例:
 * node server/scripts/maintenance/testRealPlatform.js 1 dify "如何使用 AI 助手?"
 * node server/scripts/maintenance/testRealPlatform.js 1 ragflow "产品需求文档在哪里?"
 * node server/scripts/maintenance/testRealPlatform.js 1 n8n "帮我分析一下技术架构"
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { formatGraphToContext } = require("../../utils/chats/graphContextFormatter");
const DifyProvider = require("../../utils/AiProviders/dify");
const RagflowProvider = require("../../utils/AiProviders/ragflow");
const N8nProvider = require("../../utils/AiProviders/n8n");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";

// ========== 配置区域 ==========
// 请根据你的实际环境修改以下配置

const PLATFORM_CONFIGS = {
  dify: {
    baseUrl: process.env.DIFY_BASE_URL || "https://api.dify.ai/v1",
    apiKey: process.env.DIFY_API_KEY || "YOUR_DIFY_API_KEY",
    appId: process.env.DIFY_APP_ID || null,
  },
  ragflow: {
    baseUrl: process.env.RAGFLOW_BASE_URL || "https://api.ragflow.io/v1",
    apiKey: process.env.RAGFLOW_API_KEY || "YOUR_RAGFLOW_API_KEY",
    knowledgeBaseId: process.env.RAGFLOW_KB_ID || null,
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || "https://your-n8n-instance.com/webhook/xxx",
    apiKey: process.env.N8N_API_KEY || null,
  },
};

// ========== 主函数 ==========

async function testRealPlatform() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
  
  if (args.length < 3) {
    console.log("❌ 参数不足");
    console.log("用法: node server/scripts/maintenance/testRealPlatform.js <workspaceId> <platform> <message>");
    console.log("示例: node server/scripts/maintenance/testRealPlatform.js 1 dify \"如何使用 AI 助手?\"");
    process.exit(1);
  }

  const workspaceId = parseInt(args[0]);
  const platform = args[1].toLowerCase();
  const userMessage = args[2];

  if (!["dify", "ragflow", "n8n"].includes(platform)) {
    console.log("❌ 不支持的平台:", platform);
    console.log("支持的平台: dify, ragflow, n8n");
    process.exit(1);
  }

  const config = PLATFORM_CONFIGS[platform];

  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  console.log("\n========== 测试真实平台环境 ==========");
  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`平台: ${platform}`);
  console.log(`用户消息: ${userMessage}`);
  console.log(`配置:`, JSON.stringify(config, null, 2));
  console.log("=====================================\n");

  // 步骤 1: 搜索图谱上下文
  console.log("📊 步骤 1: 搜索图谱上下文...");
  const startSearch = Date.now();
  
  const subgraph = await WorkspaceGraph.searchSubgraph({
    workspaceId,
    keyword: userMessage,
    limit: 30,
  });

  const searchTime = Date.now() - startSearch;
  console.log(`✅ 搜索完成 (${searchTime}ms)`);
  console.log(`   找到 ${subgraph.nodes.length} 个节点, ${subgraph.edges.length} 条边`);

  // 步骤 2: 格式化图谱上下文
  console.log("\n📝 步骤 2: 格式化图谱上下文...");
  const { summaryText, tokenCount } = formatGraphToContext(subgraph, {
    maxTokens: 3000,
    model: "gpt-3.5-turbo",
  });

  console.log(`✅ 格式化完成`);
  console.log(`   Token 数量: ${tokenCount}`);
  console.log(`   上下文长度: ${summaryText.length} 字符`);

  // 步骤 3: 构建增强消息
  console.log("\n🔧 步骤 3: 构建增强消息...");
  let enhancedMessage = userMessage;
  if (summaryText) {
    enhancedMessage = `${summaryText}\n\n---\n\n用户问题: ${userMessage}`;
  }

  console.log(`✅ 增强消息构建完成`);
  console.log(`   原始消息长度: ${userMessage.length} 字符`);
  console.log(`   增强消息长度: ${enhancedMessage.length} 字符`);
  console.log(`   增加内容: ${enhancedMessage.length - userMessage.length} 字符`);

  // 步骤 4: 调用外部平台
  console.log(`\n🚀 步骤 4: 调用 ${platform} 平台...`);
  console.log("=====================================");
  console.log("增强消息预览 (前 500 字符):");
  console.log(enhancedMessage.substring(0, 500));
  console.log("=====================================\n");

  if (isDryRun) {
    console.log(
      "[DRY-RUN] would execute:",
      `call ${platform} provider with enhanced message (${enhancedMessage.length} chars)`
    );
    console.log("\n========== 测试完成 ==========\n");
    return;
  }

  try {
    let response;
    const startCall = Date.now();

    switch (platform) {
      case "dify":
        response = await DifyProvider.chat(config, enhancedMessage, {
          userId: "test-user",
        });
        break;

      case "ragflow":
        response = await RagflowProvider.chat(config, enhancedMessage, {
          userId: "test-user",
        });
        break;

      case "n8n":
        response = await N8nProvider.execute(config, enhancedMessage);
        break;
    }

    const callTime = Date.now() - startCall;

    console.log(`\n✅ 平台调用成功 (${callTime}ms)`);
    console.log("=====================================");
    console.log("平台响应:");
    console.log(JSON.stringify(response, null, 2));
    console.log("=====================================\n");

  } catch (error) {
    console.error(`\n❌ 平台调用失败:`, error.message);
    console.error("错误详情:", error);
  }

  console.log("\n========== 测试完成 ==========\n");
}

// 运行测试
testRealPlatform().catch((error) => {
  console.error("❌ 测试失败:", error);
  process.exit(1);
});
