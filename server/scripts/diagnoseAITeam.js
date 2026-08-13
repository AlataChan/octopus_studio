/**
 * 诊断脚本：检查 AI 团队数据完整性
 * 用法: node server/scripts/diagnoseAITeam.js [workspaceId]
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function diagnose(workspaceId = null) {
  console.log("\n=== AI 团队数据诊断 ===\n");

  try {
    // 1. 查询所有助手
    const whereClause = workspaceId ? { workspaceId: parseInt(workspaceId) } : {};
    const assistants = await prisma.workspace_assistants.findMany({
      where: whereClause,
      include: {
        template: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${assistants.length} 个已安装的助手\n`);

    if (assistants.length === 0) {
      console.log("❌ 没有找到任何助手");
      return;
    }

    // 2. 检查每个助手的图谱节点
    for (const assistant of assistants) {
      const displayName = assistant.instanceName || assistant.template?.name || "未命名";
      const nodeId = `assistant:${assistant.id}`;

      console.log(`\n📌 助手: ${displayName}`);
      console.log(`   ID: ${assistant.id}`);
      console.log(`   Workspace ID: ${assistant.workspaceId}`);
      console.log(`   Template ID: ${assistant.templateId}`);
      console.log(`   创建时间: ${assistant.createdAt}`);

      // 检查图谱节点是否存在
      const graphNode = await prisma.workspace_graph_nodes.findUnique({
        where: {
          workspaceId_nodeId: {
            workspaceId: assistant.workspaceId,
            nodeId: nodeId,
          },
        },
      });

      if (graphNode) {
        console.log(`   ✅ 图谱节点存在`);
        console.log(`      节点 ID: ${graphNode.nodeId}`);
        console.log(`      标签: ${graphNode.label}`);
        console.log(`      类型: ${graphNode.type}`);
      } else {
        console.log(`   ❌ 图谱节点不存在！`);
        console.log(`      预期节点 ID: ${nodeId}`);
      }

      // 检查关联的边
      const edges = await prisma.workspace_graph_edges.findMany({
        where: {
          workspaceId: assistant.workspaceId,
          OR: [
            { fromNodeId: nodeId },
            { toNodeId: nodeId },
          ],
        },
      });

      console.log(`   📊 关联边数: ${edges.length}`);
      if (edges.length > 0) {
        const chatEdges = edges.filter(e => e.relation === 'assistant' && e.toNodeId.startsWith('chat_'));
        const docEdges = edges.filter(e => e.relation === 'assistant' && e.toNodeId.startsWith('doc_'));
        console.log(`      → 聊天: ${chatEdges.length}`);
        console.log(`      → 文档: ${docEdges.length}`);
      }
    }

    // 3. 统计信息
    console.log("\n\n=== 统计信息 ===\n");
    
    const assistantsWithNodes = [];
    const assistantsWithoutNodes = [];

    for (const assistant of assistants) {
      const nodeId = `assistant:${assistant.id}`;
      const graphNode = await prisma.workspace_graph_nodes.findUnique({
        where: {
          workspaceId_nodeId: {
            workspaceId: assistant.workspaceId,
            nodeId: nodeId,
          },
        },
      });

      if (graphNode) {
        assistantsWithNodes.push(assistant);
      } else {
        assistantsWithoutNodes.push(assistant);
      }
    }

    console.log(`✅ 有图谱节点的助手: ${assistantsWithNodes.length}`);
    console.log(`❌ 缺少图谱节点的助手: ${assistantsWithoutNodes.length}`);

    if (assistantsWithoutNodes.length > 0) {
      console.log("\n⚠️  以下助手缺少图谱节点:\n");
      assistantsWithoutNodes.forEach((a, i) => {
        const displayName = a.instanceName || a.template?.name || "未命名";
        console.log(`   ${i + 1}. ${displayName} (ID: ${a.id})`);
      });

      console.log("\n💡 建议: 运行迁移脚本来创建缺失的节点:");
      console.log("   node server/scripts/migrateExistingAssistantsToGraph.js\n");
    }

  } catch (error) {
    console.error("\n❌ 诊断失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行诊断
const workspaceId = process.argv[2];
diagnose(workspaceId);

