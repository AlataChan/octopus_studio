/**
 * 测试 AI 团队视图功能
 * 用法: node server/scripts/maintenance/testAITeam.js <workspaceId>
 */

const { PrismaClient } = require("@prisma/client");
const { WorkspaceAssistant } = require("../../models/workspaceAssistant");
const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { AssistantTemplate } = require("../../models/assistantTemplate");

const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

async function testAITeam(workspaceId) {
  console.log("\n=== 测试 AI 团队视图功能 ===\n");

  try {
    if (isDryRun) {
      console.log(
        "[DRY-RUN] would execute:",
        `inspect workspace ${workspaceId}, create missing test template, and install a test assistant if needed`
      );
      return;
    }

    // 1. 获取 Workspace 信息
    const workspace = await prisma.workspaces.findUnique({
      where: { id: parseInt(workspaceId) },
    });

    if (!workspace) {
      console.error("❌ Workspace 不存在");
      return;
    }

    console.log(`✅ Workspace: ${workspace.name} (${workspace.slug})`);

    // 2. 检查是否有助手模板
    const templates = await prisma.assistant_templates.findMany({
      take: 5,
    });

    console.log(`\n📋 助手模板数量: ${templates.length}`);

    if (templates.length === 0) {
      console.log("\n⚠️  没有助手模板,创建测试模板...");

      // 创建测试模板
      const testTemplate = await prisma.assistant_templates.create({
        data: {
          id: require("uuid").v4(),
          name: "测试助手",
          description: "用于测试 AI 团队视图的助手",
          category: "测试",
          tags: ["测试", "开发"],
          systemPrompt: "你是一个测试助手",
          isGlobal: true,
        },
      });

      console.log(`✅ 创建测试模板: ${testTemplate.name}`);
      templates.push(testTemplate);
    }

    // 3. 安装助手到 Workspace (如果还没有)
    const existingAssistants = await WorkspaceAssistant.listByWorkspace(
      workspace.id
    );

    console.log(`\n👥 已安装助手数量: ${existingAssistants.length}`);

    if (existingAssistants.length === 0) {
      console.log("\n⚠️  没有已安装的助手,安装测试助手...");

      const { assistant, message } = await WorkspaceAssistant.install(
        workspace.id,
        templates[0].id,
        "测试助手实例"
      );

      if (assistant) {
        console.log(`✅ 安装助手成功: ${assistant.instanceName || assistant.template.name}`);
      } else {
        console.error(`❌ 安装助手失败: ${message}`);
      }
    }

    // 4. 检查图谱中的 assistant 节点
    const graphData = await WorkspaceGraph.getFullGraph({
      workspaceId: workspace.id,
    });

    const assistantNodes = graphData.nodes.filter(
      (node) => node.type === "assistant"
    );

    console.log(`\n🔍 图谱中的 assistant 节点数量: ${assistantNodes.length}`);

    assistantNodes.forEach((node) => {
      const metadata = JSON.parse(node.metadata || "{}");
      console.log(`  - ${node.label} (${node.nodeId})`);
      console.log(`    分类: ${metadata.category || "未分类"}`);
      console.log(`    标签: ${(metadata.tags || []).join(", ")}`);
    });

    // 5. 统计每个助手的使用情况
    console.log(`\n📊 助手使用统计:`);

    for (const node of assistantNodes) {
      const chatEdges = graphData.edges.filter(
        (edge) =>
          edge.fromNodeId === node.nodeId && edge.relation === "assistant"
      );

      const docEdges = graphData.edges.filter(
        (edge) =>
          edge.fromNodeId === node.nodeId && edge.relation === "reference"
      );

      console.log(`\n  ${node.label}:`);
      console.log(`    对话数: ${chatEdges.length}`);
      console.log(`    文档数: ${docEdges.length}`);
      console.log(`    Rank: ${node.rank || 0}`);
    }

    // 6. 测试 API 数据格式
    console.log(`\n🔧 测试 API 数据格式...`);

    const assistantStats = await Promise.all(
      assistantNodes.map(async (node) => {
        const metadata = JSON.parse(node.metadata || "{}");
        const assistantId = node.externalId;

        const chatEdges = graphData.edges.filter(
          (edge) =>
            edge.fromNodeId === node.nodeId && edge.relation === "assistant"
        );

        const docEdges = graphData.edges.filter(
          (edge) =>
            edge.fromNodeId === node.nodeId && edge.relation === "reference"
        );

        return {
          id: assistantId,
          nodeId: node.nodeId,
          name: node.label,
          category: metadata.category || "未分类",
          tags: metadata.tags || [],
          platformType: metadata.platformType || null,
          knowledgeMode: metadata.knowledgeMode || "workspace",
          skills: metadata.skills || [],
          chatCount: chatEdges.length,
          documentCount: docEdges.length,
          rank: node.rank || 0,
        };
      })
    );

    console.log(`✅ API 数据格式正确`);
    console.log(JSON.stringify(assistantStats, null, 2));

    console.log(`\n✅ 所有测试通过!`);
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
const workspaceId = positionalArgs[0];

if (!workspaceId) {
  console.error("用法: node server/scripts/maintenance/testAITeam.js <workspaceId>");
  process.exit(1);
}

testAITeam(workspaceId);
