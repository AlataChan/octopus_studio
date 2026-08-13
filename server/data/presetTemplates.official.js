const {
  PRESET_TEMPLATES: CATALOG_TEMPLATES,
} = require("./presetTemplates.catalog");
const { OFFICIAL_PRESET_IDS } = require("./immutablePresetIds");

const OFFICIAL_PRESET_ID_SET = new Set(OFFICIAL_PRESET_IDS);

const OFFICIAL_TEMPLATES = CATALOG_TEMPLATES.filter((template) =>
  OFFICIAL_PRESET_ID_SET.has(template.id)
).map((template) => ({
  ...template,
  seedCategory: "official",
}));

module.exports = {
  OFFICIAL_TEMPLATES,
};
