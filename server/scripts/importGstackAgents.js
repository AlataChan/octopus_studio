#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DEFAULT_GSTACK_ROOT = "/Users/apple/Skill_hub_knowledge/gstack";
const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  "../data/presetTemplates.gstack.js"
);

const SKIP_PATTERNS = [/^setup-/, /^sync-/, /^open-gstack-browser$/];
const CODE_TOOL_MAP = Object.freeze({
  Bash: ["code_shell"],
  Read: ["code_read"],
  Grep: ["code_grep"],
  Glob: ["code_grep"],
  Write: ["code_edit", "code_write"],
  Edit: ["code_edit", "code_write"],
  WebSearch: ["web-browsing"],
  WebFetch: ["web-browsing"],
});

function stripQuotes(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function parseScalar(value) {
  const stripped = stripQuotes(value);
  if (stripped === "true") return true;
  if (stripped === "false") return false;
  if (/^\d+(\.\d+)?$/.test(stripped)) return Number(stripped);
  if (stripped.startsWith("[") && stripped.endsWith("]")) {
    return stripped.slice(1, -1).split(",").map(stripQuotes).filter(Boolean);
  }
  return stripped;
}

function parseFrontmatter(markdown) {
  const text = String(markdown || "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: text.trim() };

  const attributes = {};
  let currentListKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const listItem = line.match(/^\s*-\s*(.+?)\s*$/);
    if (listItem && currentListKey) {
      attributes[currentListKey].push(parseScalar(listItem[1]));
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValue) continue;
    const [, key, value] = keyValue;
    if (!value) {
      attributes[key] = [];
      currentListKey = key;
      continue;
    }
    attributes[key] = parseScalar(value);
    currentListKey = null;
  }

  return {
    attributes,
    body: match[2].trim(),
  };
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : [String(value)];
}

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function uniqueIdForName(name, usedIds) {
  const base = `gstack-${slugifyName(name) || "agent"}`.slice(0, 80);
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    const tail = `-${suffix++}`;
    candidate = `${base.slice(0, 80 - tail.length)}${tail}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function shouldSkipSkill(relativeDir, metadata = {}) {
  const name = String(metadata.name || path.basename(relativeDir) || "").trim();
  return SKIP_PATTERNS.some((pattern) => pattern.test(name));
}

function mapAllowedTools(allowedTools = []) {
  const mapped = [];
  const unmapped = [];
  for (const rawTool of normalizeArray(allowedTools)) {
    const tool = rawTool.trim();
    const runtimeTools = CODE_TOOL_MAP[tool];
    if (!runtimeTools) {
      if (!["Agent", "AskUserQuestion"].includes(tool)) unmapped.push(tool);
      continue;
    }
    for (const runtimeTool of runtimeTools) {
      if (!mapped.includes(runtimeTool)) mapped.push(runtimeTool);
    }
  }
  if (!mapped.includes("datetime-info")) mapped.unshift("datetime-info");
  return { mapped, unmapped };
}

function firstSentence(text, fallback) {
  const source = String(text || "").trim();
  if (!source) return fallback;
  const sentence = source.split(/(?<=[.!?。！？])\s+/)[0];
  return sentence.slice(0, 120);
}

function templateFromSkill({ skillPath, rootDir, usedIds }) {
  const raw = fs.readFileSync(skillPath, "utf8");
  const { attributes, body } = parseFrontmatter(raw);
  const relativeDir = path.relative(rootDir, path.dirname(skillPath));
  if (!relativeDir || relativeDir === ".") return null;
  if (shouldSkipSkill(relativeDir, attributes)) return null;

  const name = String(attributes.name || path.basename(relativeDir)).trim();
  const description =
    String(attributes.description || "").trim() ||
    `Gstack ${name} assistant imported from SKILL.md.`;
  const triggers = normalizeArray(attributes.triggers);
  const { mapped, unmapped } = mapAllowedTools(attributes["allowed-tools"]);

  return {
    id: uniqueIdForName(name, usedIds),
    name: `Gstack ${name}`,
    description,
    icon: "code",
    category: "Gstack",
    tags: [...new Set(["gstack", ...triggers])],
    industry: "Software",
    employeeName: name,
    employeeTitle: firstSentence(description, `Gstack ${name} agent`),
    employeeBio: description,
    avatarUrl: null,
    systemPrompt: [
      body,
      "",
      "---",
      `Source: ${path.posix.join("gstack", relativeDir, "SKILL.md")}`,
      "License/attribution: gstack skill content is imported under the upstream MIT license.",
      unmapped.length
        ? `Unmapped gstack tools degraded at import time: ${unmapped.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    defaultTools: mapped,
    defaultSkills: ["builtin:code-execution"],
    recommendedModel: null,
    knowledgeModeTemplate: "workspace",
    internalRoles: [],
    isDefault: false,
    seedCategory: "gstack",
    sourceAttribution: {
      source: "gstack",
      path: path.posix.join("gstack", relativeDir, "SKILL.md"),
      license: "MIT",
      unmappedTools: unmapped,
    },
  };
}

async function findSkillFiles(rootDir) {
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  const skillFiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(rootDir, entry.name, "SKILL.md");
    try {
      await fsp.access(skillPath, fs.constants.R_OK);
      skillFiles.push(skillPath);
    } catch {
      // ignore non-skill directories
    }
  }
  return skillFiles.sort();
}

function renderTemplatesFile(templates, sourceRoot) {
  return [
    "/*",
    " * AUTO-GENERATED by server/scripts/importGstackAgents.js.",
    " * Source: " + sourceRoot,
    " * gstack skill content is imported under the upstream MIT license.",
    " */",
    "",
    `const GSTACK_TEMPLATES = Object.freeze(${JSON.stringify(templates, null, 2)});`,
    "",
    "const GSTACK_ATTRIBUTION = Object.freeze({",
    '  source: "gstack",',
    '  license: "MIT",',
    `  generatedAt: ${JSON.stringify(new Date().toISOString())},`,
    "});",
    "",
    "module.exports = {",
    "  GSTACK_TEMPLATES,",
    "  GSTACK_ATTRIBUTION,",
    "};",
    "",
  ].join("\n");
}

async function importGstackAgents({
  rootDir = DEFAULT_GSTACK_ROOT,
  outputPath = DEFAULT_OUTPUT_PATH,
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const skillFiles = await findSkillFiles(resolvedRoot);
  const usedIds = new Set();
  const templates = skillFiles
    .map((skillPath) =>
      templateFromSkill({ skillPath, rootDir: resolvedRoot, usedIds })
    )
    .filter(Boolean);

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(
    outputPath,
    renderTemplatesFile(templates, resolvedRoot),
    "utf8"
  );
  return {
    rootDir: resolvedRoot,
    outputPath,
    scanned: skillFiles.length,
    generated: templates.length,
    skipped: skillFiles.length - templates.length,
    ids: templates.map((template) => template.id),
  };
}

async function main() {
  const rootDir =
    process.argv[2] || process.env.GSTACK_ROOT || DEFAULT_GSTACK_ROOT;
  const outputPath =
    process.argv[3] || process.env.GSTACK_OUTPUT || DEFAULT_OUTPUT_PATH;
  const result = await importGstackAgents({ rootDir, outputPath });
  console.log(
    `[gstack-import] scanned=${result.scanned} generated=${result.generated} skipped=${result.skipped}`
  );
  console.log(`[gstack-import] output=${result.outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[gstack-import] failed:", error);
    process.exit(1);
  });
}

module.exports = {
  CODE_TOOL_MAP,
  importGstackAgents,
  mapAllowedTools,
  parseFrontmatter,
  renderTemplatesFile,
  shouldSkipSkill,
  slugifyName,
  templateFromSkill,
  uniqueIdForName,
};
