const START = "<!-- SKILL_EVOLUTION_START -->";
const END = "<!-- SKILL_EVOLUTION_END -->";

function renderEvolutionMarkdown(evolution) {
  const entries = Array.isArray(evolution?.entries) ? evolution.entries : [];
  if (entries.length === 0) {
    return `${START}\n_No evolution entries yet._\n${END}\n`;
  }

  const lines = [];
  lines.push(START);
  lines.push("## Evolution");
  for (const entry of entries) {
    const title = String(entry?.title || "Update").trim();
    const content = String(entry?.content || "").trim();
    const createdAt = entry?.createdAt ? String(entry.createdAt) : null;
    lines.push(`- **${title}**${createdAt ? ` (${createdAt})` : ""}`);
    if (content) {
      lines.push(`  - ${content.replace(/\n/g, "\n    ")}`);
    }
  }
  lines.push(END);
  lines.push("");
  return lines.join("\n");
}

/**
 * Stitch evolution entries into skill.md content.
 * Idempotent via HTML comment markers.
 * @param {string} originalSkillMd
 * @param {Object} evolution
 * @returns {string}
 */
function stitchEvolution(originalSkillMd, evolution) {
  const original = String(originalSkillMd || "");
  const block = renderEvolutionMarkdown(evolution);

  const startIdx = original.indexOf(START);
  const endIdx = original.indexOf(END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = original.slice(0, startIdx);
    const after = original.slice(endIdx + END.length);
    return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n");
  }

  // Append at the end with a preceding blank line.
  const trimmed = original.replace(/\s+$/, "");
  return `${trimmed}\n\n${block}`;
}

module.exports = { stitchEvolution };
