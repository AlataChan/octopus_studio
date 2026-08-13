/**
 * 迁移脚本：为现有的助手创建图谱节点
 * 用法: node server/scripts/migrateExistingAssistantsToGraph.js
 */

const { PrismaClient } = require("@prisma/client");
const { WorkspaceGraph } = require("../models/workspaceGraph");

const prisma = new PrismaClient();

async function migrateExistingAssistants() {
  console.log("\n=== 开始迁移现有助手到图谱 ===\n");

  try {
    // 1. 获取所有已安装的助手
    const assistants = await prisma.workspace_assistants.findMany({
      include: {
        template: true,
      },
    });

    console.log(`找到 ${assistants.length} 个已安装的助手\n`);

    if (assistants.length === 0) {
      console.log("没有需要迁移的助手");
      return;
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 2. 为每个助手创建图谱节点
    for (const assistant of assistants) {
      const nodeId = `assistant:${assistant.id}`;
      
      try {
        // 检查节点是否已存在
        const existingNode = await prisma.workspace_graph_nodes.findUnique({
          where: {
            workspaceId_nodeId: {
              workspaceId: assistant.workspaceId,
              nodeId: nodeId,
            },
          },
        });

        if (existingNode) {
          console.log(`⏭️  跳过: ${assistant.instanceName || assistant.template?.name || "未命名助手"} (节点已存在)`);
          skipCount++;
          continue;
        }

        // 创建图谱节点
        const displayName = assistant.instanceName || assistant.template?.name || "未命名助手";
        await WorkspaceGraph.upsertNode({
          workspaceId: assistant.workspaceId,
          nodeId: nodeId,
          type: "assistant",
          label: displayName,
          externalId: assistant.id,
          metadata: {
            templateId: assistant.template?.id || null,
            templateName: assistant.template?.name || null,
            category: assistant.template?.category || "未分类",
            tags: assistant.template?.tags || [],
            platformType: assistant.template?.platformType || null,
            knowledgeMode: assistant.template?.knowledgeMode || "workspace",
            skills: assistant.template?.skills || [],
          },
          group: "assistant",
          rank: 0.5,
        });

        console.log(`✅ 成功: ${displayName} (Workspace ID: ${assistant.workspaceId})`);
        successCount++;
      } catch (error) {
        console.error(`❌ 失败: ${assistant.instanceName || assistant.template?.name || "未命名助手"}`);
        console.error(`   错误: ${error.message}`);
        errorCount++;
      }
    }

    // 3. 输出统计信息
    console.log("\n=== 迁移完成 ===\n");
    console.log(`总计: ${assistants.length} 个助手`);
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`⏭️  跳过: ${skipCount} 个 (已存在)`);
    console.log(`❌ 失败: ${errorCount} 个`);

    if (successCount > 0) {
      console.log("\n💡 提示: 现在你可以在 AI 团队视图中看到这些助手了！");
    }
  } catch (error) {
    console.error("\n❌ 迁移失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
migrateExistingAssistants();

