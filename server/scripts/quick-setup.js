/**
 * 快速设置脚本 - 用于测试环境
 * 
 * 此脚本会：
 * 1. 设置基本的系统配置
 * 2. 创建默认 Workspace
 * 3. 跳过 Onboarding 流程
 * 
 * 使用方法:
 * node server/scripts/quick-setup.js
 */

const path = require("path");

// 设置环境变量
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.STORAGE_DIR = process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage");

const { SystemSettings } = require("../models/systemSettings");
const { Workspace } = require("../models/workspace");

async function quickSetup() {
  console.log("🚀 开始快速设置...\n");

  try {
    // 1. 设置 LLM Provider (使用 Ollama 作为示例)
    console.log("📝 设置 LLM Provider...");
    await SystemSettings.updateSettings({
      LLMProvider: "ollama",
      OllamaLLMBasePath: "http://127.0.0.1:11434",
      OllamaLLMModelPref: "llama2",
    });
    console.log("✅ LLM Provider 设置完成\n");

    // 2. 设置 Embedding Engine (使用 Native)
    console.log("📝 设置 Embedding Engine...");
    await SystemSettings.updateSettings({
      EmbeddingEngine: "native",
      EmbeddingModelPref: "Xenova/all-MiniLM-L6-v2",
    });
    console.log("✅ Embedding Engine 设置完成\n");

    // 3. 设置 Vector Database (使用 LanceDB)
    console.log("📝 设置 Vector Database...");
    await SystemSettings.updateSettings({
      VectorDB: "lancedb",
    });
    console.log("✅ Vector Database 设置完成\n");

    // 4. 禁用 Telemetry
    console.log("📝 禁用 Telemetry...");
    await SystemSettings.updateSettings({
      DisableTelemetry: "true",
    });
    console.log("✅ Telemetry 已禁用\n");

    // 5. 检查是否已有 Workspace
    const existingWorkspaces = await Workspace.where();
    if (existingWorkspaces.length === 0) {
      console.log("📝 创建默认 Workspace...");
      const workspace = await Workspace.new("测试工作区", "default-workspace");
      console.log(`✅ Workspace 创建成功: ${workspace.name} (slug: ${workspace.slug})\n`);
    } else {
      console.log(`ℹ️  已存在 ${existingWorkspaces.length} 个 Workspace，跳过创建\n`);
    }

    // 6. 显示当前配置
    console.log("📊 当前系统配置:");
    const settings = await SystemSettings.currentSettings();
    console.log(`  - LLM Provider: ${settings.LLMProvider || "未设置"}`);
    console.log(`  - Embedding Engine: ${settings.EmbeddingEngine || "未设置"}`);
    console.log(`  - Vector DB: ${settings.VectorDB || "未设置"}`);
    console.log(`  - Workspaces: ${existingWorkspaces.length} 个\n`);

    console.log("🎉 快速设置完成！\n");
    console.log("📝 下一步:");
    console.log("  1. 启动后端: cd server && npm run dev");
    console.log("  2. 启动前端: cd frontend && npm run dev");
    console.log("  3. 访问: http://localhost:3000\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ 设置失败:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// 运行设置
quickSetup();

