const FALLBACK_ICON = "🤖";
const FALLBACK_COLOR = "#3B82F6";

/**
 * Apply minimum render-safe defaults required by Assistant Library surfaces.
 *
 * @param {Object} row
 * @returns {Object}
 */
function applyRenderSafeFallbacks(row = {}) {
  const safe = { ...row };

  safe.name = safe.name || "Unnamed Agent";
  safe.description = safe.description || "(无描述)";
  safe.category = safe.category || "uncategorized";
  safe.icon = safe.icon || FALLBACK_ICON;
  safe.color = safe.color || FALLBACK_COLOR;
  safe.employeeName = safe.employeeName || safe.name;
  safe.employeeTitle = safe.employeeTitle || `${safe.category} 专家`;
  safe.employeeBio =
    safe.employeeBio || String(safe.description).slice(0, 200);

  if (!Array.isArray(safe.skills)) {
    safe.skills = [];
  }

  const fallbackSkills = [
    `${safe.category} 相关`,
    "咨询与建议",
    "方案制定",
  ];

  for (const skill of fallbackSkills) {
    if (safe.skills.length >= 3) break;
    if (!safe.skills.includes(skill)) {
      safe.skills.push(skill);
    }
  }

  return safe;
}

/**
 * Validate the minimum render-safe shape expected by the UI.
 *
 * @param {Object} row
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateRenderSafe(row = {}) {
  const errors = [];

  if (!row.name) errors.push("name is required");
  if (!row.description) errors.push("description is required");
  if (!row.category) errors.push("category is required");
  if (!row.icon) errors.push("icon is required");
  if (!row.color) errors.push("color is required");
  if (!row.employeeName) errors.push("employeeName is required");
  if (!row.employeeTitle) errors.push("employeeTitle is required");
  if (!Array.isArray(row.skills) || row.skills.length < 3) {
    errors.push("skills must have at least 3 items");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  FALLBACK_ICON,
  FALLBACK_COLOR,
  applyRenderSafeFallbacks,
  validateRenderSafe,
};
