const fs = require("fs");
const yaml = require("js-yaml");

const { parseFrontmatter } = require("../../MarkdownParser");
const { writeFileAtomic } = require("../format/writeFileAtomic");

function buildSkillMd({ frontmatter, body }) {
  const fm = { ...(frontmatter || {}) };
  const dumped = yaml.dump(fm, { lineWidth: -1 }).trimEnd();
  const content = String(body || "").trim();
  return `---\n${dumped}\n---\n\n${content}\n`;
}

function normalizeFlowTemplate(template) {
  if (!template || typeof template !== "object") return null;
  const id = String(template.id || "").trim();
  if (!id) return null;

  const name = String(template.name || "").trim() || id;
  const description = String(template.description || "").trim();
  const slashCommand = template.slashCommand
    ? String(template.slashCommand).trim()
    : null;

  const flowDefinition =
    template.flowDefinition && typeof template.flowDefinition === "object"
      ? template.flowDefinition
      : null;

  if (!flowDefinition) return null;

  return {
    ...template,
    id,
    name,
    description,
    ...(slashCommand ? { slashCommand } : {}),
    flowDefinition,
  };
}

/**
 * Upsert a flowTemplate entry into a Skill Hub `skill.md` frontmatter.
 *
 * Rules:
 * - If `flowTemplates` is missing, create it as an array.
 * - If an entry with same `id` exists, replace it (upsert).
 * - Otherwise, append the new template.
 *
 * @param {string} skillMdPath
 * @param {Object} flowTemplate
 * @returns {{updated: boolean, templateId: string}}
 */
function upsertFlowTemplateInSkillMd(skillMdPath, flowTemplate) {
  const filePath = String(skillMdPath || "").trim();
  if (!filePath) throw new Error("skillMdPath is required");
  if (!fs.existsSync(filePath))
    throw new Error(`skill.md not found: ${filePath}`);

  const normalized = normalizeFlowTemplate(flowTemplate);
  if (!normalized)
    throw new Error("Invalid flowTemplate (requires id + flowDefinition)");

  const current = fs.readFileSync(filePath, "utf8");
  const { data: frontmatter, content: body } = parseFrontmatter(current);
  const fm = frontmatter && typeof frontmatter === "object" ? frontmatter : {};

  const list = Array.isArray(fm.flowTemplates) ? fm.flowTemplates : [];
  const idx = list.findIndex(
    (t) => String(t?.id || "").trim() === normalized.id
  );
  if (idx >= 0) {
    list[idx] = normalized;
  } else {
    list.push(normalized);
  }

  fm.flowTemplates = list;

  const next = buildSkillMd({ frontmatter: fm, body });
  writeFileAtomic(filePath, next, { encoding: "utf8" });
  return { updated: true, templateId: normalized.id };
}

module.exports = {
  upsertFlowTemplateInSkillMd,
};
