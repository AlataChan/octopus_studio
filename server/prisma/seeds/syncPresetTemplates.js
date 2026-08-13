/**
 * 同步 presetTemplates.js 到数据库
 *
 * 功能：
 * - 新增：创建数据库中不存在的模板
 * - 更新：同步已存在模板的 defaultTools, systemPrompt 等字段
 * - 保留：不删除数据库中多余的模板
 *
 * 运行方式：
 * node server/prisma/seeds/syncPresetTemplates.js
 */

const { PrismaClient } = require("@prisma/client");
const {
  convertTemplateToDbData,
  getSeedTemplates,
} = require("./seedDefaultAssistants");

const prisma = new PrismaClient();
const PRESET_TEMPLATES = getSeedTemplates();

/**
 * 将 presetTemplate 转换为数据库格式
 */
function convertToDbFormat(template) {
  return convertTemplateToDbData(template);
}

/**
 * 需要同步更新的字段列表
 */
const SYNC_FIELDS = [
  "defaultTools",
  "defaultMCPServers",
  "systemPrompt",
  "internalRoles",
  "agentFlowId",
  "recommendedModel",
  "knowledgeModeTemplate",
  "seedCategory",
];

async function syncTemplates() {
  console.log("🔄 开始同步 presetTemplates 到数据库...\n");
  console.log(`📦 源文件包含 ${PRESET_TEMPLATES.length} 个模板\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const template of PRESET_TEMPLATES) {
    const dbData = convertToDbFormat(template);

    // 通过不可变 preset ID 查找现有模板，避免误更新用户自建同名模板
    const existing = await prisma.assistant_templates.findFirst({
      where: { id: template.id },
    });

    if (existing) {
      // 检查是否需要更新
      const updates = {};
      let hasChanges = false;

      for (const field of SYNC_FIELDS) {
        const newValue = dbData[field];
        const oldValue = existing[field];

        // 比较 JSON 字段
        if (typeof newValue === "string" && typeof oldValue === "string") {
          if (newValue !== oldValue) {
            updates[field] = newValue;
            hasChanges = true;
          }
        } else if (newValue !== oldValue) {
          updates[field] = newValue;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await prisma.assistant_templates.update({
          where: { id: existing.id },
          data: updates,
        });
        console.log(`✏️  更新: ${template.icon} ${template.name}`);

        // 显示更新的字段
        const updatedFields = Object.keys(updates);
        console.log(`   📝 更新字段: ${updatedFields.join(", ")}`);

        // 特别显示 defaultTools 的变化
        if (updates.defaultTools) {
          const oldTools = JSON.parse(existing.defaultTools || "[]");
          const newTools = JSON.parse(updates.defaultTools);
          const addedTools = newTools.filter((t) => !oldTools.includes(t));
          const removedTools = oldTools.filter((t) => !newTools.includes(t));
          if (addedTools.length > 0) {
            console.log(`   ➕ 新增工具: ${addedTools.join(", ")}`);
          }
          if (removedTools.length > 0) {
            console.log(`   ➖ 移除工具: ${removedTools.join(", ")}`);
          }
        }
        updated++;
      } else {
        console.log(`⏭️  跳过: ${template.name} (无变化)`);
        skipped++;
      }
    } else {
      // 创建新模板
      await prisma.assistant_templates.create({
        data: dbData,
      });
      console.log(`✅ 创建: ${template.icon} ${template.name}`);
      created++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `📊 同步完成: 创建 ${created} 个, 更新 ${updated} 个, 跳过 ${skipped} 个`
  );
  console.log("=".repeat(60));

  // 显示重要提示
  if (updated > 0) {
    console.log("\n⚠️  重要提示:");
    console.log("   已更新的模板会立即对新对话生效。");
    console.log("   已存在的助手实例会自动使用最新的模板配置。");
    console.log("   无需重新雇佣助手！\n");
  }
}

syncTemplates()
  .catch((e) => {
    console.error("❌ 同步失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
