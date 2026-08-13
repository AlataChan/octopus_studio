/**
 * 获取第一个 workspace 的 ID
 */

const prisma = require("../utils/prisma");

async function getWorkspaceId() {
  try {
    const workspace = await prisma.workspaces.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!workspace) {
      console.log("❌ 没有找到任何 workspace");
      console.log("请先创建一个 workspace");
      process.exit(1);
    }

    console.log("✅ 找到 workspace:");
    console.log(`   ID: ${workspace.id}`);
    console.log(`   名称: ${workspace.name}`);
    console.log(`   Slug: ${workspace.slug}`);
    console.log();
    console.log("你可以使用以下命令测试:");
    console.log(`   node server/scripts/maintenance/testGraphData.js ${workspace.id}`);
    console.log(`   node server/scripts/maintenance/testGraphSearch.js ${workspace.id} "AI"`);

    return workspace.id;
  } catch (error) {
    console.error("❌ 查询失败:", error);
    process.exit(1);
  }
}

getWorkspaceId().then(() => process.exit(0));

