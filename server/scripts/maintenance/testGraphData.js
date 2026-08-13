/**
 * 测试脚本: 创建图谱测试数据
 * 用法: node server/scripts/maintenance/testGraphData.js <workspaceId>
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");

async function createTestData(workspaceId) {
  console.log(`\n=== 开始创建测试数据 (Workspace ID: ${workspaceId}) ===\n`);

  try {
    // 1. 创建文档节点
    console.log("1. 创建文档节点...");
    
    const doc1 = await WorkspaceGraph.upsertNode({
      workspaceId,
      nodeId: "doc_test_001",
      type: "doc",
      label: "产品需求文档 - AI 助手功能",
      externalId: "test_doc_001",
      metadata: {
        title: "产品需求文档 - AI 助手功能",
        description: "详细描述 AI 助手的功能需求和技术实现方案",
        tags: ["产品", "AI", "需求文档"],
        createdAt: new Date().toISOString(),
      },
      rank: 0.9,
    });
    console.log(`   ✓ 创建文档节点: ${doc1.label}`);

    const doc2 = await WorkspaceGraph.upsertNode({
      workspaceId,
      nodeId: "doc_test_002",
      type: "doc",
      label: "技术架构设计 - 知识图谱模块",
      externalId: "test_doc_002",
      metadata: {
        title: "技术架构设计 - 知识图谱模块",
        description: "知识图谱的数据模型、API 设计和性能优化方案",
        tags: ["技术", "架构", "知识图谱"],
        createdAt: new Date().toISOString(),
      },
      rank: 0.85,
    });
    console.log(`   ✓ 创建文档节点: ${doc2.label}`);

    const doc3 = await WorkspaceGraph.upsertNode({
      workspaceId,
      nodeId: "doc_test_003",
      type: "doc",
      label: "用户手册 - 如何使用 AI 助手",
      externalId: "test_doc_003",
      metadata: {
        title: "用户手册 - 如何使用 AI 助手",
        description: "面向终端用户的 AI 助手使用指南",
        tags: ["用户手册", "AI", "教程"],
        createdAt: new Date().toISOString(),
      },
      rank: 0.7,
    });
    console.log(`   ✓ 创建文档节点: ${doc3.label}`);

    // 2. 创建标签节点
    console.log("\n2. 创建标签节点...");
    
    const tags = ["产品", "AI", "需求文档", "技术", "架构", "知识图谱", "用户手册", "教程"];
    for (const tag of tags) {
      const tagNodeId = `tag_${tag.toLowerCase().replace(/\s+/g, "_")}`;
      await WorkspaceGraph.upsertNode({
        workspaceId,
        nodeId: tagNodeId,
        type: "tag",
        label: tag,
        externalId: null,
        metadata: { tagName: tag },
      });
      console.log(`   ✓ 创建标签节点: ${tag}`);
    }

    // 3. 创建标签关系
    console.log("\n3. 创建标签关系...");
    
    const tagRelations = [
      { from: "doc_test_001", to: "tag_产品" },
      { from: "doc_test_001", to: "tag_ai" },
      { from: "doc_test_001", to: "tag_需求文档" },
      { from: "doc_test_002", to: "tag_技术" },
      { from: "doc_test_002", to: "tag_架构" },
      { from: "doc_test_002", to: "tag_知识图谱" },
      { from: "doc_test_003", to: "tag_用户手册" },
      { from: "doc_test_003", to: "tag_ai" },
      { from: "doc_test_003", to: "tag_教程" },
    ];

    for (const rel of tagRelations) {
      await WorkspaceGraph.upsertEdge({
        workspaceId,
        fromNodeId: rel.from,
        toNodeId: rel.to,
        relation: "tag",
        weight: null,
        metadata: null,
      });
    }
    console.log(`   ✓ 创建 ${tagRelations.length} 条标签关系`);

    // 4. 创建文档间的链接关系
    console.log("\n4. 创建文档链接关系...");
    
    await WorkspaceGraph.upsertEdge({
      workspaceId,
      fromNodeId: "doc_test_002",
      toNodeId: "doc_test_001",
      relation: "reference",
      weight: null,
      metadata: { description: "技术架构参考产品需求" },
    });
    console.log("   ✓ 技术架构 → 产品需求");

    await WorkspaceGraph.upsertEdge({
      workspaceId,
      fromNodeId: "doc_test_003",
      toNodeId: "doc_test_001",
      relation: "reference",
      weight: null,
      metadata: { description: "用户手册参考产品需求" },
    });
    console.log("   ✓ 用户手册 → 产品需求");

    // 5. 获取统计信息
    console.log("\n5. 图谱统计信息:");
    const stats = await WorkspaceGraph.getStats(workspaceId);
    console.log(`   - 节点总数: ${stats.nodeCount}`);
    console.log(`   - 边总数: ${stats.edgeCount}`);
    console.log(`   - 节点类型分布:`, stats.typeDistribution);

    console.log("\n=== 测试数据创建完成! ===\n");
    console.log("你可以使用以下命令测试搜索:");
    console.log(`  - 搜索 "AI": node server/scripts/maintenance/testGraphSearch.js ${workspaceId} "AI"`);
    console.log(`  - 搜索 "技术": node server/scripts/maintenance/testGraphSearch.js ${workspaceId} "技术"`);

  } catch (error) {
    console.error("\n❌ 创建测试数据失败:", error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  const workspaceId = parseInt(process.argv[2]);

  if (!workspaceId || isNaN(workspaceId)) {
    console.error("用法: node server/scripts/maintenance/testGraphData.js <workspaceId>");
    console.error("示例: node server/scripts/maintenance/testGraphData.js 1");
    process.exit(1);
  }

  await createTestData(workspaceId);
  process.exit(0);
}

main();

