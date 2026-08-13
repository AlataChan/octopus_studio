/**
 * Dify 集成测试脚本
 * 用于验证 Dify 平台集成功能
 */

const DifyProvider = require("../AiProviders/dify");

// 测试配置（请替换为真实的 Dify 配置）
const TEST_CONFIG = {
  baseUrl: "https://api.dify.ai/v1",
  apiKey: "app-your-api-key-here", // 替换为真实的 API Key
  appId: "your-app-id-here", // 替换为真实的 App ID
};

/**
 * 测试连接
 */
async function testConnection() {
  console.log("🔍 测试 Dify 连接...");
  console.log("配置:", {
    baseUrl: TEST_CONFIG.baseUrl,
    apiKey: TEST_CONFIG.apiKey.substring(0, 10) + "...",
    appId: TEST_CONFIG.appId,
  });

  try {
    const result = await DifyProvider.testConnection(TEST_CONFIG);
    if (result.success) {
      console.log("✅ 连接成功:", result.message);
      return true;
    } else {
      console.error("❌ 连接失败:", result.message);
      return false;
    }
  } catch (error) {
    console.error("❌ 连接异常:", error.message);
    return false;
  }
}

/**
 * 测试阻塞式聊天
 */
async function testChat() {
  console.log("\n💬 测试阻塞式聊天...");

  try {
    const result = await DifyProvider.chat(
      TEST_CONFIG,
      "你好，请介绍一下你自己",
      {
        userId: "test-user",
      }
    );

    if (result.success) {
      console.log("✅ 聊天成功");
      console.log("回复内容:", result.content);
      console.log("对话 ID:", result.conversationId);
      console.log("消息 ID:", result.messageId);
      return result.conversationId;
    } else {
      console.error("❌ 聊天失败:", result.error);
      return null;
    }
  } catch (error) {
    console.error("❌ 聊天异常:", error.message);
    return null;
  }
}

/**
 * 测试流式聊天
 */
async function testChatStream(conversationId = null) {
  console.log("\n🌊 测试流式聊天...");

  try {
    let fullContent = "";
    let chunkCount = 0;

    await DifyProvider.chatStream(
      TEST_CONFIG,
      "请用一句话总结你的核心能力",
      (chunk) => {
        if (chunk.type === "content") {
          fullContent += chunk.delta;
          chunkCount++;
          process.stdout.write(chunk.delta);
        } else if (chunk.type === "done") {
          console.log("\n✅ 流式聊天完成");
          console.log("总块数:", chunkCount);
          console.log("完整内容:", chunk.content);
          console.log("对话 ID:", chunk.conversationId);
        } else if (chunk.type === "error") {
          console.error("\n❌ 流式聊天错误:", chunk.error);
        }
      },
      {
        userId: "test-user",
        conversationId,
      }
    );

    return true;
  } catch (error) {
    console.error("❌ 流式聊天异常:", error.message);
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log("=".repeat(60));
  console.log("🚀 Dify 集成测试");
  console.log("=".repeat(60));

  // 检查配置
  if (
    TEST_CONFIG.apiKey === "app-your-api-key-here" ||
    TEST_CONFIG.appId === "your-app-id-here"
  ) {
    console.error("\n❌ 请先在脚本中配置真实的 Dify API Key 和 App ID");
    console.log("\n📝 配置方法:");
    console.log("1. 登录 Dify 控制台");
    console.log("2. 创建或选择一个应用");
    console.log("3. 在 API 访问页面获取 API Key 和 App ID");
    console.log("4. 修改本脚本中的 TEST_CONFIG 配置");
    return;
  }

  // 测试 1: 连接测试
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.log("\n⚠️  连接测试失败，跳过后续测试");
    return;
  }

  // 测试 2: 阻塞式聊天
  const conversationId = await testChat();

  // 测试 3: 流式聊天（复用对话 ID）
  await testChatStream(conversationId);

  console.log("\n" + "=".repeat(60));
  console.log("✅ 所有测试完成");
  console.log("=".repeat(60));
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("测试失败:", error);
      process.exit(1);
    });
}

module.exports = {
  testConnection,
  testChat,
  testChatStream,
  runAllTests,
};
