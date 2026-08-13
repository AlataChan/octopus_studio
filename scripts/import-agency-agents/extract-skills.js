const GENERIC_SECTIONS = new Set([
  "identity",
  "memory",
  "mission",
  "core mission",
  "critical rules",
  "rules",
  "deliverables",
  "technical deliverables",
  "workflow",
  "workflow process",
  "communication",
  "communication style",
  "learning",
  "learning & memory",
  "your identity",
  "your core mission",
]);

/**
 * Extract render-safe skill labels from markdown headings.
 *
 * @param {string} body
 * @param {string} [fallbackCategory]
 * @returns {string[]}
 */
function extractSkills(body, fallbackCategory = "general") {
  const headers = [];

  for (const line of String(body || "").split("\n")) {
    const match = line.match(/^##+\s+(.+)$/);
    if (!match) continue;

    let title = match[1].trim();
    title = title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
    title = title.replace(/[*_`~>#-]/g, " ").replace(/\s+/g, " ").trim();

    const lower = title.toLowerCase();
    if (GENERIC_SECTIONS.has(lower)) continue;
    if (!title || title.length < 2 || title.length > 40) continue;

    headers.push(title);
  }

  const skills = headers.slice(0, 8);
  const fallbacks = [
    `${fallbackCategory} 相关`,
    "咨询与建议",
    "方案制定",
  ];

  for (const fallback of fallbacks) {
    if (skills.length >= 3) break;
    if (!skills.includes(fallback)) {
      skills.push(fallback);
    }
  }

  return skills;
}

module.exports = { extractSkills, GENERIC_SECTIONS };
