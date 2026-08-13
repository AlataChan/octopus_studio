/**
 * 测试助手安装流程
 * 用于诊断为什么新安装的助手没有出现在 AI 团队中
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function testInstallFlow() {
  console.log("=== 测试助手安装流程 ===\n");

  try {
    // 1. 查找最近安装的助手
    console.log("1. 查找最近安装的助手...");
    const recentAssistants = await prisma.workspace_assistants.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        template: true,
        workspace: true,
      },
    });

    console.log(`找到 ${recentAssistants.length} 个最近安装的助手:\n`);
    recentAssistants.forEach((a, i) => {
      console.log(`${i + 1}. ${a.instanceName || a.template.name}`);
      console.log(`   - ID: ${a.id}`);
      console.log(`   - Template: ${a.template.name}`);
      console.log(`   - Workspace: ${a.workspace.name} (ID: ${a.workspaceId})`);
      console.log(`   - 安装时间: ${a.createdAt}`);
      console.log();
    });

    // 2. 检查这些助手是否有对应的图谱节点
    console.log("\n2. 检查图谱节点...\n");
    for (const assistant of recentAssistants) {
      const nodeId = `assistant:${assistant.id}`;
      const node = await prisma.workspace_graph_nodes.findUnique({
        where: {
          workspaceId_nodeId: {
            workspaceId: assistant.workspaceId,
            nodeId: nodeId,
          },
        },
      });

      if (node) {
        console.log(`✅ ${assistant.instanceName || assistant.template.name}`);
        console.log(`   - 图谱节点存在: ${nodeId}`);
        console.log(`   - 节点标签: ${node.label}`);
        console.log(`   - 节点类型: ${node.type}`);
      } else {
        console.log(`❌ ${assistant.instanceName || assistant.template.name}`);
        console.log(`   - 图谱节点缺失: ${nodeId}`);
        console.log(`   - 这个助手不会出现在 AI 团队中！`);
      }
      console.log();
    }

    // 3. 统计所有助手和图谱节点
    console.log("\n3. 统计数据...\n");
    const totalAssistants = await prisma.workspace_assistants.count();
    const totalAssistantNodes = await prisma.workspace_graph_nodes.count({
      where: { type: "assistant" },
    });

    console.log(`总助手数: ${totalAssistants}`);
    console.log(`总助手节点数: ${totalAssistantNodes}`);
    console.log(`缺失节点数: ${totalAssistants - totalAssistantNodes}`);

    if (totalAssistants > totalAssistantNodes) {
      console.log("\n⚠️  警告: 有助手缺少图谱节点！");
      console.log("建议运行迁移脚本: node server/scripts/migrateExistingAssistantsToGraph.js");
    } else {
      console.log("\n✅ 所有助手都有对应的图谱节点");
    }

    // 4. 检查最近的事件日志
    console.log("\n\n4. 检查最近的安装事件...\n");
    const recentEvents = await prisma.event_logs.findMany({
      where: { event: "assistant_installed" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    console.log(`找到 ${recentEvents.length} 个最近的安装事件:\n`);
    recentEvents.forEach((e, i) => {
      const metadata = JSON.parse(e.metadata || "{}");
      console.log(`${i + 1}. ${metadata.workspaceName || "未知工作区"}`);
      console.log(`   - 助手 ID: ${metadata.assistantId}`);
      console.log(`   - 模板 ID: ${metadata.templateId}`);
      console.log(`   - 时间: ${e.createdAt}`);
      console.log();
    });

    console.log("\n=== 测试完成 ===");
  } catch (error) {
    console.error("❌ 测试失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testInstallFlow();

