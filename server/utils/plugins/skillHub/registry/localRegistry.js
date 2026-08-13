const fs = require("fs");
const path = require("path");

const {
  BUILTIN_PLUGINS_PATH,
  PLUGINS_BASE_PATH,
  PLUGIN_DIRECTORIES,
  SKILL_MANIFEST_FILE,
  FRONTMATTER_DEFAULTS,
} = require("../../constants");
const {
  parseFrontmatter,
  generateContentHash,
  parseNameFromFilename,
} = require("../../MarkdownParser");

function normalizePosix(p) {
  return String(p || "")
    .split(path.sep)
    .join("/");
}

function findSkillManifestsRecursively(baseDir) {
  const results = [];
  if (!baseDir || !fs.existsSync(baseDir)) return results;

  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === SKILL_MANIFEST_FILE) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function toStableSlug(relativeDir) {
  // Route-safe: do not include "/" in skillId (Express path params would break).
  return String(relativeDir || "")
    .split(path.sep)
    .filter(Boolean)
    .join("__");
}

function scoreSkill(skill, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return 0;

  const name = String(skill?.name || "").toLowerCase();
  const description = String(skill?.description || "").toLowerCase();
  const tags = Array.isArray(skill?.tags)
    ? skill.tags.map((t) => String(t || "").toLowerCase())
    : [];
  const id = String(skill?.skillId || "").toLowerCase();

  let score = 0;
  if (name.includes(q)) score += 3;
  if (description.includes(q)) score += 2;
  if (id.includes(q)) score += 1.5;
  if (tags.some((t) => t.includes(q))) score += 1;

  return score;
}

function normalizeConfigSchema(raw) {
  if (!raw) return null;
  // Allow legacy shape: configSchema: [{ key, label, type, ... }]
  if (Array.isArray(raw)) {
    return { version: "1.0", fields: raw };
  }
  if (typeof raw !== "object") return null;
  const version = String(raw.version || "1.0");
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  return { version, fields };
}

function normalizeArrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

/**
 * Local skill.md registry (builtin + custom/local).
 *
 * Stable IDs:
 * - builtin: `builtin:<dir>` (dir relative to builtin skills root, path segments joined by `__`)
 * - custom/local: `custom:<dir>` (dir relative to custom skills root, path segments joined by `__`)
 */
class LocalRegistry {
  constructor(options = {}) {
    const builtinBaseRoot = options.builtinBaseRoot || BUILTIN_PLUGINS_PATH;
    const customBaseRoot = options.customBaseRoot || PLUGINS_BASE_PATH;

    const builtinSkillsDir =
      options.builtinSkillsDir ||
      path.join(builtinBaseRoot, PLUGIN_DIRECTORIES.skills);
    const customSkillsDir =
      options.customSkillsDir ||
      path.join(customBaseRoot, PLUGIN_DIRECTORIES.skills);

    this.builtinBaseRoot = builtinBaseRoot;
    this.customBaseRoot = customBaseRoot;
    this.builtinSkillsDir = builtinSkillsDir;
    this.customSkillsDir = customSkillsDir;

    /** @type {Map<string, Object>} */
    this._byId = new Map();
    /** @type {Object[]} */
    this._skills = [];
    this._scanned = false;
  }

  async scan({ forceRefresh = false } = {}) {
    if (this._scanned && !forceRefresh) return this._skills;

    const skills = [];
    const byId = new Map();

    const scanOneRoot = (skillsDir, baseRoot, prefix, sourceType) => {
      const manifests = findSkillManifestsRecursively(skillsDir);
      for (const manifestPath of manifests) {
        let content = "";
        try {
          content = fs.readFileSync(manifestPath, "utf8");
        } catch {
          continue;
        }

        const { data: frontmatter, content: body } = parseFrontmatter(content);
        const contentHash = generateContentHash(content);

        const skillDir = path.dirname(manifestPath);
        const relativeDir = path.relative(skillsDir, skillDir);
        const slug = toStableSlug(relativeDir);
        const skillId = `${prefix}${slug}`;

        const inferredName = parseNameFromFilename(path.basename(skillDir));

        const originPath = normalizePosix(
          path.relative(baseRoot, manifestPath)
        );

        const metadata = {
          skillId,
          name: frontmatter.name || inferredName,
          description: frontmatter.description || "",
          version: frontmatter.version || FRONTMATTER_DEFAULTS.version,
          category: frontmatter.category || FRONTMATTER_DEFAULTS.category,
          tags: frontmatter.tags || FRONTMATTER_DEFAULTS.tags,
          icon: frontmatter.icon || FRONTMATTER_DEFAULTS.icon,
          author: frontmatter.author,
          configSchema: normalizeConfigSchema(frontmatter.configSchema),
          // P4 scaffolding: unify Flow/MCP into Skill metadata (optional)
          flowTemplates: normalizeArrayOrNull(frontmatter.flowTemplates),
          mcpBindings: normalizeArrayOrNull(frontmatter.mcpBindings),
          mcpServers: normalizeArrayOrNull(frontmatter.mcpServers),
          // Skill Hub extended fields (optional)
          sourceType: frontmatter.sourceType || sourceType,
          sourceUrl: frontmatter.sourceUrl,
          sourceHash: frontmatter.sourceHash,
          license: frontmatter.license,
          verified: frontmatter.verified === true,
          latestVersion: frontmatter.latestVersion,
          lastCheckedAt: frontmatter.lastCheckedAt,
          tools: frontmatter.tools || [],
          permissionMode:
            frontmatter.permissionMode || FRONTMATTER_DEFAULTS.permissionMode,
          allowedTools:
            frontmatter.allowedTools || FRONTMATTER_DEFAULTS.allowedTools,
          autoApprovedTools:
            frontmatter.autoApprovedTools ||
            FRONTMATTER_DEFAULTS.autoApprovedTools,
          resourceScopes:
            frontmatter.resourceScopes || FRONTMATTER_DEFAULTS.resourceScopes,
          recommendedModel: frontmatter.recommendedModel,
          systemPrompt: body,
          contentHash,
          originPath,
          parsedAt: new Date(),
        };

        byId.set(skillId, metadata);
        skills.push(metadata);
      }
    };

    scanOneRoot(
      this.builtinSkillsDir,
      this.builtinBaseRoot,
      "builtin:",
      "builtin"
    );
    scanOneRoot(this.customSkillsDir, this.customBaseRoot, "custom:", "local");

    this._skills = skills;
    this._byId = byId;
    this._scanned = true;

    return skills;
  }

  search(query, { topN = 10 } = {}) {
    const q = String(query || "").trim();
    if (!q) return [];

    const scored = this._skills
      .map((skill) => ({ skill, score: scoreSkill(skill, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN).map((row) => row.skill);
  }

  get(skillId) {
    return this._byId.get(String(skillId || "")) || null;
  }
}

module.exports = { LocalRegistry };
