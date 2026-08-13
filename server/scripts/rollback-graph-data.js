#!/usr/bin/env node

/**
 * 图谱数据回滚脚本
 * @description 用于清理或回滚知识图谱增强功能产生的数据
 *
 * 使用方法:
 *   node scripts/rollback-graph-data.js --workspace=1 --type=entity
 *   node scripts/rollback-graph-data.js --workspace=1 --type=similarity
 *   node scripts/rollback-graph-data.js --workspace=1 --type=all
 *   node scripts/rollback-graph-data.js --all-workspaces --type=entity
 *   node scripts/rollback-graph-data.js --list-workspaces
 *   node scripts/rollback-graph-data.js --status --workspace=1
 *
 * 参数:
 *   --workspace=<id>    指定工作空间 ID
 *   --all-workspaces    对所有工作空间执行
 *   --type=<type>       回滚类型: entity, similarity, all
 *   --dry-run           只显示将要执行的操作，不实际执行
 *   --list-workspaces   列出所有工作空间
 *   --status            显示图谱状态
 */

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const prisma = require("../utils/prisma");
const { graphCache } = require("../utils/chats/graphCache");

// 解析命令行参数
function parseArgs() {
  const args = {
    workspace: null,
    allWorkspaces: false,
    type: null,
    dryRun: false,
    listWorkspaces: false,
    status: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--workspace=")) {
      args.workspace = parseInt(arg.split("=")[1]);
    } else if (arg === "--all-workspaces") {
      args.allWorkspaces = true;
    } else if (arg.startsWith("--type=")) {
      args.type = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--list-workspaces") {
      args.listWorkspaces = true;
    } else if (arg === "--status") {
      args.status = true;
    }
  }

  return args;
}

// 列出所有工作空间
async function listWorkspaces() {
  const workspaces = await prisma.workspaces.findMany({
    select: { id: true, name: true, slug: true },
  });

  console.log("\n📂 Available Workspaces:");
  console.log("========================");
  for (const ws of workspaces) {
    console.log(`  ID: ${ws.id} | Name: ${ws.name} | Slug: ${ws.slug}`);
  }
  console.log("");
}

// 显示工作空间图谱状态
async function showStatus(workspaceId) {
  const nodeStats = await prisma.workspace_graph_nodes.groupBy({
    by: ["type"],
    where: { workspaceId },
    _count: { id: true },
  });

  const edgeStats = await prisma.workspace_graph_edges.groupBy({
    by: ["relation"],
    where: { workspaceId },
    _count: { id: true },
  });

  console.log(`\n📊 Graph Status for Workspace ${workspaceId}:`);
  console.log("============================================");

  console.log("\n📦 Nodes by Type:");
  for (const stat of nodeStats) {
    console.log(`  ${stat.type}: ${stat._count.id}`);
  }

  console.log("\n🔗 Edges by Relation:");
  for (const stat of edgeStats) {
    console.log(`  ${stat.relation}: ${stat._count.id}`);
  }

  console.log("");
}

// 回滚实体数据
async function rollbackEntities(workspaceId, dryRun) {
  console.log(`\n🔄 Rolling back entity data for workspace ${workspaceId}...`);

  if (dryRun) {
    const entityCount = await prisma.workspace_graph_nodes.count({
      where: { workspaceId, type: "entity" },
    });
    const edgeCount = await prisma.workspace_graph_edges.count({
      where: {
        workspaceId,
        OR: [
          { relation: "mentioned_in" },
          { relation: "related_to" },
          { fromNodeId: { startsWith: "entity_" } },
          { toNodeId: { startsWith: "entity_" } },
        ],
      },
    });
    console.log(`  [DRY RUN] Would delete ${entityCount} entity nodes`);
    console.log(`  [DRY RUN] Would delete ${edgeCount} entity edges`);
    return { nodesDeleted: 0, edgesDeleted: 0, dryRun: true };
  }

  // 删除相关的边
  const edgesResult = await prisma.workspace_graph_edges.deleteMany({
    where: {
      workspaceId,
      OR: [
        { relation: "mentioned_in" },
        { relation: "related_to" },
        { fromNodeId: { startsWith: "entity_" } },
        { toNodeId: { startsWith: "entity_" } },
      ],
    },
  });

  // 删除实体节点
  const nodesResult = await prisma.workspace_graph_nodes.deleteMany({
    where: { workspaceId, type: "entity" },
  });

  // 清理缓存
  graphCache.clearWorkspace(workspaceId);

  console.log(`  ✅ Deleted ${nodesResult.count} entity nodes`);
  console.log(`  ✅ Deleted ${edgesResult.count} entity edges`);

  return { nodesDeleted: nodesResult.count, edgesDeleted: edgesResult.count };
}

// 回滚相似边数据
async function rollbackSimilarity(workspaceId, dryRun) {
  console.log(`\n🔄 Rolling back similarity edges for workspace ${workspaceId}...`);

  if (dryRun) {
    const edgeCount = await prisma.workspace_graph_edges.count({
      where: { workspaceId, relation: "similar" },
    });
    console.log(`  [DRY RUN] Would delete ${edgeCount} similarity edges`);
    return { edgesDeleted: 0, dryRun: true };
  }

  const result = await prisma.workspace_graph_edges.deleteMany({
    where: { workspaceId, relation: "similar" },
  });

  // 清理缓存
  graphCache.clearWorkspace(workspaceId);

  console.log(`  ✅ Deleted ${result.count} similarity edges`);

  return { edgesDeleted: result.count };
}

// 回滚所有增强数据
async function rollbackAll(workspaceId, dryRun) {
  console.log(`\n🔄 Rolling back ALL enhancement data for workspace ${workspaceId}...`);

  const entityResult = await rollbackEntities(workspaceId, dryRun);
  const similarityResult = await rollbackSimilarity(workspaceId, dryRun);

  return {
    entities: entityResult,
    similarity: similarityResult,
  };
}

// 获取所有工作空间 ID
async function getAllWorkspaceIds() {
  const workspaces = await prisma.workspaces.findMany({
    select: { id: true },
  });
  return workspaces.map((ws) => ws.id);
}

// 主函数
async function main() {
  const args = parseArgs();

  console.log("🔧 Knowledge Graph Rollback Tool");
  console.log("=================================");

  try {
    // 列出工作空间
    if (args.listWorkspaces) {
      await listWorkspaces();
      return;
    }

    // 显示状态
    if (args.status) {
      if (!args.workspace && !args.allWorkspaces) {
        console.error("❌ Please specify --workspace=<id> or --all-workspaces");
        process.exit(1);
      }

      const workspaceIds = args.allWorkspaces
        ? await getAllWorkspaceIds()
        : [args.workspace];

      for (const wsId of workspaceIds) {
        await showStatus(wsId);
      }
      return;
    }

    // 验证参数
    if (!args.workspace && !args.allWorkspaces) {
      console.error("❌ Please specify --workspace=<id> or --all-workspaces");
      console.log("\nUsage:");
      console.log("  node scripts/rollback-graph-data.js --workspace=1 --type=entity");
      console.log("  node scripts/rollback-graph-data.js --all-workspaces --type=similarity");
      console.log("  node scripts/rollback-graph-data.js --list-workspaces");
      console.log("  node scripts/rollback-graph-data.js --status --workspace=1");
      process.exit(1);
    }

    if (!args.type || !["entity", "similarity", "all"].includes(args.type)) {
      console.error("❌ Please specify --type=<entity|similarity|all>");
      process.exit(1);
    }

    if (args.dryRun) {
      console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
    }

    // 获取工作空间 ID 列表
    const workspaceIds = args.allWorkspaces
      ? await getAllWorkspaceIds()
      : [args.workspace];

    console.log(`\n🎯 Target workspaces: ${workspaceIds.join(", ")}`);
    console.log(`📋 Rollback type: ${args.type}`);

    // 确认操作
    if (!args.dryRun) {
      console.log("\n⚠️  WARNING: This operation will delete data permanently!");
      console.log("   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // 执行回滚
    const results = {};
    for (const wsId of workspaceIds) {
      switch (args.type) {
        case "entity":
          results[wsId] = await rollbackEntities(wsId, args.dryRun);
          break;
        case "similarity":
          results[wsId] = await rollbackSimilarity(wsId, args.dryRun);
          break;
        case "all":
          results[wsId] = await rollbackAll(wsId, args.dryRun);
          break;
      }
    }

    // 显示总结
    console.log("\n📊 Rollback Summary:");
    console.log("====================");
    console.log(JSON.stringify(results, null, 2));

    console.log("\n✅ Rollback completed successfully!");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
