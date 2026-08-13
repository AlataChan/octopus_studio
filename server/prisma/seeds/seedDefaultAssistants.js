/**
 * Seed 脚本：插入生产默认 AI 助手模板
 *
 * 运行方式：
 * node server/prisma/seeds/seedDefaultAssistants.js
 */

const { PrismaClient } = require("@prisma/client");
const { OFFICIAL_TEMPLATES } = require("../../data/presetTemplates.official");
const { DEMO_TEMPLATES } = require("../../data/presetTemplates.demo");
const { GSTACK_TEMPLATES } = require("../../data/presetTemplates.gstack");
const {
  OFFICIAL_PRESET_IDS,
  DEMO_PRESET_IDS,
  GSTACK_PRESET_IDS,
} = require("../../data/immutablePresetIds");
const {
  resolveDefaultEmployeePresetIds,
} = require("../../data/defaultEmployees");

const prisma = new PrismaClient();
const OFFICIAL_PRESET_ID_SET = new Set(OFFICIAL_PRESET_IDS);
const DEMO_PRESET_ID_SET = new Set(DEMO_PRESET_IDS);
const GSTACK_PRESET_ID_SET = new Set(GSTACK_PRESET_IDS);

function gstackAssistantsEnabled(env = process.env) {
  return env.SEED_GSTACK_ASSISTANTS === "true";
}

function getSeedTemplates(options = {}) {
  const includeGstack =
    typeof options.includeGstack === "boolean"
      ? options.includeGstack
      : gstackAssistantsEnabled(options.env || process.env);

  return [
    ...OFFICIAL_TEMPLATES,
    ...DEMO_TEMPLATES,
    ...(includeGstack ? GSTACK_TEMPLATES : []),
  ];
}

function seedCategoryForPresetId(presetId) {
  if (OFFICIAL_PRESET_ID_SET.has(presetId)) return "official";
  if (DEMO_PRESET_ID_SET.has(presetId)) return "demo";
  if (GSTACK_PRESET_ID_SET.has(presetId)) return "gstack";
  return null;
}

function convertTemplateToDbData(template) {
  const persona = template.personaTemplates?.[0]?.persona || {};
  const avatarUrl = template.personaTemplates?.[0]?.avatarUrl || null;
  const tools = template.defaultTools || [];
  const skills = template.defaultSkills || [];
  const allTools = [...new Set([...tools, ...skills])];

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    category: template.category,
    seedCategory: template.seedCategory || seedCategoryForPresetId(template.id),
    tags: JSON.stringify(template.tags || []),
    industry: template.industry,
    employeeName: persona.employeeName || template.employeeName,
    employeeTitle: persona.employeeTitle || template.employeeTitle,
    employeeBio: persona.employeeBio || "",
    avatarUrl: avatarUrl || template.avatarUrl || null,
    skills: JSON.stringify(persona.skillTags || []),
    workExperience: JSON.stringify(persona.workExperience || []),
    certifications: JSON.stringify(persona.certifications || []),
    systemPrompt: template.systemPrompt,
    defaultTools: JSON.stringify(allTools),
    defaultMCPServers: JSON.stringify(template.defaultMCPServers || {}),
    recommendedModel: template.recommendedModel,
    knowledgeModeTemplate: template.knowledgeModeTemplate || "workspace",
    internalRoles: JSON.stringify(template.internalRoles || []),
    agentFlowId: template.agentFlowId || null,
    sourceType: "builtin",
    pluginType: "agent",
    isGlobal: true,
    isDefault: template.isDefault || false,
  };
}

async function backfillAssistantSeedCategories(prismaClient = prisma) {
  const result = {
    templates: { scanned: 0, updated: 0 },
    workspaceAssistants: { scanned: 0, updated: 0 },
  };

  const templates = await prismaClient.assistant_templates.findMany({
    select: { id: true, seedCategory: true },
  });

  result.templates.scanned = templates.length;
  for (const template of templates) {
    const seedCategory = seedCategoryForPresetId(template.id);
    if (!seedCategory || template.seedCategory === seedCategory) continue;

    await prismaClient.assistant_templates.update({
      where: { id: template.id },
      data: { seedCategory },
    });
    result.templates.updated++;
  }

  if (!prismaClient.workspace_assistants?.findMany) return result;

  const workspaceAssistants = await prismaClient.workspace_assistants.findMany({
    select: { id: true, templateId: true, category: true },
  });

  result.workspaceAssistants.scanned = workspaceAssistants.length;
  for (const assistant of workspaceAssistants) {
    const category = seedCategoryForPresetId(assistant.templateId);
    if (!category || assistant.category === category) continue;

    await prismaClient.workspace_assistants.update({
      where: { id: assistant.id },
      data: { category },
    });
    result.workspaceAssistants.updated++;
  }

  return result;
}

async function seedDefaultAssistants(prismaClient = prisma, options = {}) {
  const templates = getSeedTemplates(options);
  const backfillResult = await backfillAssistantSeedCategories(prismaClient);
  const defaultEmployeePresetIds = resolveDefaultEmployeePresetIds(
    options.env || process.env
  );
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    backfill: backfillResult,
  };

  for (const template of templates) {
    const dbData = convertTemplateToDbData(template);
    const shouldMarkDefault =
      defaultEmployeePresetIds?.has(template.id) === true;
    if (shouldMarkDefault) dbData.isDefault = true;

    const existing = await prismaClient.assistant_templates.findFirst({
      where: { id: template.id },
    });

    if (existing) {
      const updateData = {};
      if (existing.seedCategory !== dbData.seedCategory) {
        updateData.seedCategory = dbData.seedCategory;
      }
      if (shouldMarkDefault && existing.isDefault !== true) {
        updateData.isDefault = true;
      }

      if (Object.keys(updateData).length > 0) {
        await prismaClient.assistant_templates.update({
          where: { id: existing.id },
          data: updateData,
        });
        result.updated++;
        continue;
      }

      result.skipped++;
      continue;
    }

    await prismaClient.assistant_templates.create({ data: dbData });
    result.created++;
  }

  return result;
}

async function main() {
  console.log("🚀 开始插入默认 AI 助手模板...\n");
  console.log("📦 Demo assistants: always included");
  console.log(
    `📦 Gstack assistants: ${gstackAssistantsEnabled() ? "enabled" : "disabled"}`
  );

  const result = await seedDefaultAssistants(prisma);

  console.log("\n" + "=".repeat(50));
  console.log(
    `📊 执行结果: 创建 ${result.created} 个, 更新 ${result.updated} 个, 跳过 ${result.skipped} 个`
  );
  console.log(
    `📊 分类回填: templates ${result.backfill.templates.updated}/${result.backfill.templates.scanned}, workspace_assistants ${result.backfill.workspaceAssistants.updated}/${result.backfill.workspaceAssistants.scanned}`
  );
  console.log("=".repeat(50));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("❌ Seed 执行失败:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  backfillAssistantSeedCategories,
  convertTemplateToDbData,
  gstackAssistantsEnabled,
  getSeedTemplates,
  seedCategoryForPresetId,
  seedDefaultAssistants,
};
