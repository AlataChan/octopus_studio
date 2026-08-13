/**
 * @fileoverview 修复 AI 员工模板中的无效插件名
 * @description 将 save-file-browser 修正为 save-file-to-browser，chart 修正为 create-chart
 *
 * 运行方式: cd server && node scripts/fix-assistant-plugin-names.js
 */

const prisma = require("../utils/prisma");

/**
 * 插件名称映射表（错误名称 -> 正确名称）
 */
const PLUGIN_NAME_FIXES = {
  "save-file-browser": "save-file-to-browser",
  "chart": "create-chart",
};

/**
 * 修复单个工具配置数组中的插件名
 * @param {string[]} tools - 工具名称数组
 * @returns {{ tools: string[], fixed: string[] }} 修复后的工具数组和修复记录
 */
function fixToolNames(tools) {
  if (!Array.isArray(tools)) {
    return { tools, fixed: [] };
  }

  const fixed = [];
  const newTools = tools.map((tool) => {
    if (PLUGIN_NAME_FIXES[tool]) {
      fixed.push(`${tool} -> ${PLUGIN_NAME_FIXES[tool]}`);
      return PLUGIN_NAME_FIXES[tool];
    }
    return tool;
  });

  return { tools: newTools, fixed };
}

/**
 * 主函数：修复所有 AI 员工模板的插件名
 */
async function main() {
  console.log("========================================");
  console.log("AI 员工模板插件名修复工具");
  console.log("========================================\n");

  try {
    // 1. 获取所有 AI 员工模板
    const templates = await prisma.assistant_templates.findMany();
    console.log(`找到 ${templates.length} 个 AI 员工模板\n`);

    let totalFixed = 0;

    for (const template of templates) {
      console.log(`检查模板: ${template.name} (${template.id})`);

      // 解析 defaultTools
      let defaultTools = template.defaultTools;
      if (typeof defaultTools === "string") {
        try {
          defaultTools = JSON.parse(defaultTools);
        } catch {
          console.log(`  ⚠️ 无法解析 defaultTools，跳过`);
          continue;
        }
      }

      if (!Array.isArray(defaultTools)) {
        console.log(`  ℹ️ defaultTools 不是数组，跳过`);
        continue;
      }

      // 检查并修复插件名
      const { tools: fixedTools, fixed } = fixToolNames(defaultTools);

      if (fixed.length > 0) {
        console.log(`  🔧 发现 ${fixed.length} 个需要修复的插件名:`);
        fixed.forEach((f) => console.log(`     - ${f}`));

        // 更新数据库
        await prisma.assistant_templates.update({
          where: { id: template.id },
          data: { defaultTools: JSON.stringify(fixedTools) },
        });

        console.log(`  ✅ 已更新`);
        totalFixed += fixed.length;
      } else {
        console.log(`  ✓ 无需修复`);
      }

      console.log("");
    }

    console.log("========================================");
    console.log(`完成！共修复 ${totalFixed} 个插件名`);
    console.log("========================================");
  } catch (error) {
    console.error("执行出错:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
main();

