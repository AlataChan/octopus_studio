/**
 * 检查 Dify 助手配置
 */

const prisma = require("../utils/prisma");

async function checkDifyAssistant() {
  console.log("\n========== 检查 Dify 助手配置 ==========\n");

  // 查找所有 Dify 助手模板
  const difyTemplates = await prisma.assistant_templates.findMany({
    where: {
      platformType: "dify",
    },
    select: {
      id: true,
      name: true,
      employeeName: true,
      description: true,
      platformType: true,
      platformConfig: true,
      knowledgeModeTemplate: true,
      createdAt: true,
    },
  });

  if (difyTemplates.length === 0) {
    console.log("❌ 没有找到 Dify 助手模板");
    return;
  }

  console.log(`✅ 找到 ${difyTemplates.length} 个 Dify 助手模板:\n`);

  difyTemplates.forEach((template, index) => {
    console.log(`${index + 1}. ${template.employeeName || template.name}`);
    console.log(`   ID: ${template.id}`);
    console.log(`   描述: ${template.description}`);
    console.log(`   知识模式: ${template.knowledgeModeTemplate || "未设置"}`);
    
    // 解析 platformConfig
    let config = {};
    try {
      config = typeof template.platformConfig === "string"
        ? JSON.parse(template.platformConfig)
        : template.platformConfig;
    } catch (e) {
      console.log(`   ⚠️  platformConfig 解析失败`);
    }

    console.log(`   Base URL: ${config.baseUrl || "未设置"}`);
    console.log(`   API Key: ${config.apiKey ? config.apiKey.substring(0, 10) + "..." : "未设置"}`);
    console.log(`   App ID: ${config.appId || "未设置"}`);
    console.log(`   创建时间: ${template.createdAt.toISOString()}`);
    console.log("");
  });

  // 查找已安装的 Dify 助手实例
  console.log("========== 已安装的 Dify 助手实例 ==========\n");

  const difyInstances = await prisma.workspace_assistants.findMany({
    where: {
      template: {
        platformType: "dify",
      },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      template: {
        select: {
          id: true,
          name: true,
          employeeName: true,
          knowledgeModeTemplate: true,
        },
      },
    },
  });

  if (difyInstances.length === 0) {
    console.log("❌ 没有找到已安装的 Dify 助手实例");
    console.log("提示: 需要先在 Workspace 中聘用 Dify 助手\n");
    return;
  }

  console.log(`✅ 找到 ${difyInstances.length} 个已安装的 Dify 助手实例:\n`);

  difyInstances.forEach((instance, index) => {
    console.log(`${index + 1}. ${instance.instanceName || instance.template.employeeName || instance.template.name}`);
    console.log(`   实例 ID: ${instance.id}`);
    console.log(`   Workspace: ${instance.workspace.name} (ID: ${instance.workspaceId})`);
    console.log(`   模板: ${instance.template.employeeName || instance.template.name}`);
    console.log(`   知识模式 (模板): ${instance.template.knowledgeModeTemplate || "未设置"}`);
    console.log(`   知识模式 (覆盖): ${instance.knowledgeModeOverride || "继承模板"}`);
    console.log(`   状态: ${instance.enabled ? "启用" : "禁用"}`);
    console.log("");
  });

  console.log("========================================\n");
}

checkDifyAssistant()
  .catch((error) => {
    console.error("❌ 检查失败:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

