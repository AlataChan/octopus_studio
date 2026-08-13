const fs = require("fs");
const path = require("path");

function normalizePosix(p) {
  return String(p || "")
    .split(path.sep)
    .join("/");
}

function defaultCacheDir() {
  const storageDir =
    process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
  return path.join(storageDir, "skill-hub", "cache");
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
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

function externalDownloadsEnabled() {
  return "SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED" in process.env;
}

function extractEntityIdFromImportId(importId) {
  const raw = String(importId || "").trim();
  if (!raw) return null;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return null;
  return parts[2] || null;
}

function toSkillIndexItem(item) {
  const id =
    String(item?.id || "").trim() ||
    extractEntityIdFromImportId(item?.importId);
  if (!id) return null;

  const importId =
    item?.importId || item?.import_id || `allm-community-id:agent-skill:${id}`;

  return {
    skillId: `community:${id}`,
    name: item?.name || item?.title || `Community Skill ${id}`,
    description: item?.description || item?.short_description || "",
    category: item?.category || "general",
    tags: Array.isArray(item?.tags) ? item.tags : [],
    icon: item?.icon || "🌐",
    verified: item?.verified === true,
    visibility: item?.visibility || "public",
    sourceType: "community",
    sourceUrl: String(importId),
    importId: String(importId),
    registry: "community-hub",
  };
}

class CommunityRegistry {
  constructor(options = {}) {
    this._cacheDir = options.cacheDir || defaultCacheDir();
    this._cacheFile = path.join(this._cacheDir, "community-index.json");
    /** @type {Object[]} */
    this._index = [];
    this._loaded = false;
  }

  async loadIndex({ forceRefresh = false } = {}) {
    if (this._loaded && !forceRefresh) return this._index.length;
    ensureDir(this._cacheDir);

    let loaded = [];
    if (fs.existsSync(this._cacheFile)) {
      try {
        const content = fs.readFileSync(this._cacheFile, "utf8");
        const parsed = JSON.parse(content || "[]");
        if (Array.isArray(parsed)) loaded = parsed;
        if (Array.isArray(parsed?.skills)) loaded = parsed.skills;
      } catch {
        loaded = [];
      }
    }

    this._index = loaded;
    this._loaded = true;
    return this._index.length;
  }

  async refresh() {
    if (!externalDownloadsEnabled()) {
      throw new Error(
        "Community registry refresh is disabled. Set SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED (or allow_all) to enable."
      );
    }

    const { CommunityHub } = require("../../../../models/communityHub");
    const explore = await CommunityHub.fetchExploreItems();
    const agentItems = Array.isArray(explore?.agentSkills?.items)
      ? explore.agentSkills.items
      : [];

    const mapped = [];
    const seen = new Set();
    for (const item of agentItems) {
      const skill = toSkillIndexItem(item);
      if (!skill) continue;
      if (seen.has(skill.skillId)) continue;
      seen.add(skill.skillId);
      mapped.push(skill);
    }

    this._index = mapped;
    this._loaded = true;

    ensureDir(this._cacheDir);
    try {
      fs.writeFileSync(
        this._cacheFile,
        JSON.stringify(this._index, null, 2),
        "utf8"
      );
    } catch {
      // ignore
    }

    return this._index.length;
  }

  async search(query, { topN = 10, threshold = 0.1 } = {}) {
    await this.loadIndex();
    const q = String(query || "").trim();
    if (!q) return [];

    const scored = this._index
      .map((skill) => ({ skill, score: scoreSkill(skill, q) }))
      .filter((row) => row.score >= threshold)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN).map((row) => row.skill);
  }

  async get(skillIdOrName) {
    await this.loadIndex();
    const key = String(skillIdOrName || "")
      .trim()
      .toLowerCase();
    if (!key) return null;

    return (
      this._index.find((s) => String(s.skillId || "").toLowerCase() === key) ||
      this._index.find((s) => String(s.name || "").toLowerCase() === key) ||
      null
    );
  }

  async listSkills({ category = null } = {}) {
    await this.loadIndex();
    const categoryKey = category ? String(category).toLowerCase() : null;

    return this._index.filter((skill) => {
      if (
        categoryKey &&
        String(skill.category || "").toLowerCase() !== categoryKey
      ) {
        return false;
      }
      return true;
    });
  }

  listSources() {
    return {
      cacheDir: normalizePosix(this._cacheDir),
      cacheFile: normalizePosix(this._cacheFile),
    };
  }
}

module.exports = { CommunityRegistry };
