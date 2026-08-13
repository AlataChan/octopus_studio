const DEFAULT_DESKTOP_EMPLOYEE_PRESET_IDS = new Set([
  "employee-legal-contract-reviewer",
  "employee-ocr-document-scanner",
  "employee-hr-resume-screener",
  "employee-admin-document-writer",
]);

function parseCsvEnv(value) {
  if (!value || typeof value !== "string") return null;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

/**
 * Resolves the additive default team marker.
 *
 * The seed path only sets matching templates to isDefault=true; it does not
 * clear previously default templates. Future builtin content corrections should
 * be explicit migrations or a syncPresetTemplates-style maintenance script,
 * not implicit upgrade overwrites of user-editable template fields.
 */
function resolveDefaultEmployeePresetIds(env = process.env) {
  const fromEnv = parseCsvEnv(env.ALATA_DEFAULT_EMPLOYEE_IDS);
  if (fromEnv) return fromEnv;

  if (env.ANYTHING_LLM_RUNTIME === "desktop") {
    return DEFAULT_DESKTOP_EMPLOYEE_PRESET_IDS;
  }

  return null;
}

module.exports = {
  DEFAULT_DESKTOP_EMPLOYEE_PRESET_IDS,
  resolveDefaultEmployeePresetIds,
};
