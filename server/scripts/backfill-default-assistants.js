/**
 * 默认助手回填脚本
 * 
 * 功能：
 * 1. 将指定模板标记为系统默认（isDefault=true）
 * 2. 对于已安装为 hired 的实例，将其 source 改为 default
 * 3. 对于未安装的 Workspace，自动安装默认助手
 * 
 * 使用方法：
 *   cd server && node scripts/backfill-default-assistants.js
 */

const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");

// 要标记为默认的模板名称列表
const DEFAULT_TEMPLATE_NAMES = [
  "长文协作助手",
  "市场调研助手",
  "数据挖掘分析师",
  "项目管理工程师",
  "项目审核分析师",
  "默认助手",  // 通用助手
  "AI合同审核",
  "AI票证识别",
  "AI简历筛选",
  "AI公文助手",
];

async function backfillDefaultAssistants() {
  console.log("🚀 开始回填默认助手...\n");

  try {
    // 1. 查找要标记为默认的模板
    const templates = await prisma.assistant_templates.findMany({
      where: {
        name: { in: DEFAULT_TEMPLATE_NAMES }
      }
    });

    if (templates.length === 0) {
      console.log("❌ 未找到指定的默认模板，请检查模板名称");
      return;
    }

    console.log(`📋 找到 ${templates.length} 个模板需要处理：`);
    templates.forEach(t => console.log(`   - ${t.name} (${t.id})`));
    console.log("");

    // 2. 将模板标记为 isDefault = true
    for (const template of templates) {
      if (!template.isDefault) {
        await prisma.assistant_templates.update({
          where: { id: template.id },
          data: { isDefault: true }
        });
        console.log(`✅ 已将模板「${template.name}」标记为系统默认`);
      } else {
        console.log(`⏭️  模板「${template.name}」已是系统默认，跳过`);
      }
    }
    console.log("");

    // 3. 获取所有 Workspace
    const workspaces = await prisma.workspaces.findMany();
    console.log(`🏢 找到 ${workspaces.length} 个 Workspace\n`);

    // 4. 为每个 Workspace 处理默认助手
    for (const workspace of workspaces) {
      console.log(`📁 处理 Workspace: ${workspace.name || workspace.slug} (ID: ${workspace.id})`);

      for (const template of templates) {
        // 检查是否已安装
        const existing = await prisma.workspace_assistants.findUnique({
          where: {
            workspaceId_templateId: {
              workspaceId: workspace.id,
              templateId: template.id
            }
          }
        });

        if (existing) {
          // 已安装，检查是否需要更新 source
          if (existing.source !== "default") {
            await prisma.workspace_assistants.update({
              where: { id: existing.id },
              data: { source: "default" }
            });
            console.log(`   🔄 已将「${template.name}」的 source 从 "${existing.source}" 改为 "default"`);
          } else {
            console.log(`   ⏭️  「${template.name}」已是 default，跳过`);
          }
        } else {
          // 未安装，创建新实例
          await prisma.workspace_assistants.create({
            data: {
              id: uuidv4(),
              workspaceId: workspace.id,
              templateId: template.id,
              instanceName: null,
              customConfig: null,
              enabled: true,
              source: "default"
            }
          });
          console.log(`   ➕ 已为 Workspace 安装默认助手「${template.name}」`);
        }
      }
      console.log("");
    }

    console.log("🎉 回填完成！");

    // 5. 输出统计信息
    const stats = await prisma.workspace_assistants.groupBy({
      by: ["source"],
      _count: { id: true }
    });
    console.log("\n📊 当前助手来源分布：");
    stats.forEach(s => {
      const label = s.source === "hired" ? "外聘" : s.source === "default" ? "预置" : s.source === "custom" ? "内培" : s.source;
      console.log(`   ${label}: ${s._count.id} 个`);
    });

  } catch (error) {
    console.error("❌ 回填失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
backfillDefaultAssistants();
