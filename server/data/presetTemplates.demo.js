const {
  PRESET_TEMPLATES: CATALOG_TEMPLATES,
} = require("./presetTemplates.catalog");
const { DEMO_PRESET_IDS } = require("./immutablePresetIds");

const DEMO_PRESET_ID_SET = new Set(DEMO_PRESET_IDS);

const DEMO_TEMPLATES = CATALOG_TEMPLATES.filter((template) =>
  DEMO_PRESET_ID_SET.has(template.id)
).map((template) => ({
  ...template,
  seedCategory: "demo",
}));

module.exports = {
  DEMO_TEMPLATES,
};
