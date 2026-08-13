const OFFICIAL_PRESET_IDS = Object.freeze([
  "preset-policy-advisor",
  "preset-knowledge-extractor",
  "preset-sop-writer",
  "preset-report-generator",
  "preset-email-writer",
  "preset-meeting-notes",
  "preset-contract-reviewer",
  "preset-data-analyst",
  "preset-crossborder-listing",
  "preset-crossborder-review",
  "preset-crossborder-market-intel",
  "preset-crossborder-compliance",
  "preset-content-title",
  "preset-content-hotspot",
  "preset-content-analysis",
  "preset-content-script",
  "preset-mfg-supplier",
  "preset-mfg-quality",
  "preset-mfg-translation",
  "preset-mfg-maintenance",
]);

const DEMO_PRESET_IDS = Object.freeze([
  "employee-luna-content-writer",
  "employee-suqing-market-research",
  "employee-vera-data-analyst",
  "employee-ethan-project-manager",
  "employee-clara-project-reviewer",
  "employee-legal-contract-reviewer",
  "employee-ocr-document-scanner",
  "employee-hr-resume-screener",
  "employee-admin-document-writer",
]);

const { GSTACK_TEMPLATES } = require("./presetTemplates.gstack");

const GSTACK_PRESET_IDS = Object.freeze(
  GSTACK_TEMPLATES.map((template) => template.id)
);

module.exports = {
  OFFICIAL_PRESET_IDS,
  DEMO_PRESET_IDS,
  GSTACK_PRESET_IDS,
};
