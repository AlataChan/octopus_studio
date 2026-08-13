const { OFFICIAL_TEMPLATES } = require("./presetTemplates.official");
const { DEMO_TEMPLATES } = require("./presetTemplates.demo");
const { GSTACK_TEMPLATES } = require("./presetTemplates.gstack");

const PRIORITY_AI_IDS = [
  "employee-legal-contract-reviewer",
  "employee-ocr-document-scanner",
  "employee-hr-resume-screener",
  "employee-admin-document-writer",
];

function gstackAssistantsEnabled(env = process.env) {
  return env.SEED_GSTACK_ASSISTANTS === "true";
}

function getPresetTemplateSource(options = {}) {
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

function sortTemplatesWithStarFirst(templates) {
  return [...templates].sort((a, b) => {
    const aIsAI = PRIORITY_AI_IDS.includes(a.id) ? 2 : 0;
    const bIsAI = PRIORITY_AI_IDS.includes(b.id) ? 2 : 0;
    if (aIsAI !== bIsAI) return bIsAI - aIsAI;

    const aIsStar = a.hasPresetPersona === true ? 1 : 0;
    const bIsStar = b.hasPresetPersona === true ? 1 : 0;
    return bIsStar - aIsStar;
  });
}

function getAllPresets(options = {}) {
  return sortTemplatesWithStarFirst(getPresetTemplateSource(options));
}

function getPresetById(presetId, options = {}) {
  return (
    getPresetTemplateSource(options).find((preset) => preset.id === presetId) ||
    null
  );
}

function getPresetsByCategory(category, options = {}) {
  const templates = getPresetTemplateSource(options);
  if (!category || category === "全部") {
    return sortTemplatesWithStarFirst(templates);
  }

  return sortTemplatesWithStarFirst(
    templates.filter((preset) => preset.category === category)
  );
}

function getAllCategories(options = {}) {
  const templates = getPresetTemplateSource(options);
  const orderedCategories = ["通用基础", "跨境电商", "自媒体", "制造业"];
  const existingCategories = [
    ...new Set(templates.map((preset) => preset.category)),
  ];

  const sorted = orderedCategories.filter((category) =>
    existingCategories.includes(category)
  );
  const others = existingCategories.filter(
    (category) => !orderedCategories.includes(category)
  );

  return ["全部", ...sorted, ...others];
}

module.exports = {
  PRESET_TEMPLATES: getPresetTemplateSource(),
  getPresetTemplateSource,
  gstackAssistantsEnabled,
  getAllPresets,
  getPresetById,
  getPresetsByCategory,
  getAllCategories,
};
