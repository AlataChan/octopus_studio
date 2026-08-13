/**
 * 测试脚本: 测试图谱搜索功能
 * 用法: node server/scripts/maintenance/testGraphSearch.js <workspaceId> <keyword>
 */

const { WorkspaceGraph } = require("../../models/workspaceGraph");
const { formatGraphToContext } = require("../../utils/chats/graphContextFormatter");

async function testSearch(workspaceId, keyword) {
  console.log(`\n=== 测试图谱搜索 ===`);
  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`关键词: "${keyword}"\n`);

  try {
    // 1. 搜索子图
    console.log("1. 搜索子图...");
    const startTime = Date.now();
    
    const subgraph = await WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword,
      limit: 30,
    });

    const searchTime = Date.now() - startTime;
    console.log(`   ✓ 搜索完成 (耗时: ${searchTime}ms)`);
    console.log(`   - 找到节点: ${subgraph.nodes.length} 个`);
    console.log(`   - 找到边: ${subgraph.edges.length} 条\n`);

    // 2. 显示节点详情
    if (subgraph.nodes.length > 0) {
      console.log("2. 节点详情:");
      subgraph.nodes.forEach((node, index) => {
        console.log(`   [${index + 1}] ${node.label} (${node.type})`);
        if (node.metadata && Object.keys(node.metadata).length > 0) {
          console.log(`       元数据:`, JSON.stringify(node.metadata, null, 2).split('\n').map(line => `       ${line}`).join('\n').trim());
        }
      });
      console.log();
    }

    // 3. 显示边详情
    if (subgraph.edges.length > 0) {
      console.log("3. 关系详情:");
      subgraph.edges.forEach((edge, index) => {
        const fromNode = subgraph.nodes.find(n => n.nodeId === edge.fromNodeId);
        const toNode = subgraph.nodes.find(n => n.nodeId === edge.toNodeId);
        
        if (fromNode && toNode) {
          console.log(`   [${index + 1}] ${fromNode.label} --[${edge.relation}]--> ${toNode.label}`);
          if (edge.weight) {
            console.log(`       权重: ${edge.weight}`);
          }
        }
      });
      console.log();
    }

    // 4. 格式化为上下文
    console.log("4. 格式化为 LLM 上下文:");
    const formatStartTime = Date.now();
    
    const { summaryText, graphSources, tokenCount } = formatGraphToContext(subgraph, {
      maxTokens: 3000,
      model: "gpt-3.5-turbo",
    });

    const formatTime = Date.now() - formatStartTime;
    console.log(`   ✓ 格式化完成 (耗时: ${formatTime}ms)`);
    console.log(`   - Token 数量: ${tokenCount}`);
    console.log(`   - 来源数量: ${graphSources.length}\n`);

    console.log("5. 上下文预览:");
    console.log("---");
    console.log(summaryText);
    console.log("---\n");

    // 6. 测试缓存
    console.log("6. 测试缓存 (第二次搜索):");
    const cacheStartTime = Date.now();
    
    await WorkspaceGraph.searchSubgraph({
      workspaceId,
      keyword,
      limit: 30,
    });

    const cacheTime = Date.now() - cacheStartTime;
    console.log(`   ✓ 搜索完成 (耗时: ${cacheTime}ms)`);
    console.log(`   - 性能提升: ${((searchTime - cacheTime) / searchTime * 100).toFixed(1)}%\n`);

    console.log("=== 测试完成! ===\n");

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  const workspaceId = parseInt(process.argv[2]);
  const keyword = process.argv[3];

  if (!workspaceId || isNaN(workspaceId) || !keyword) {
    console.error("用法: node server/scripts/maintenance/testGraphSearch.js <workspaceId> <keyword>");
    console.error("示例: node server/scripts/maintenance/testGraphSearch.js 1 \"AI\"");
    process.exit(1);
  }

  await testSearch(workspaceId, keyword);
  process.exit(0);
}

main();

