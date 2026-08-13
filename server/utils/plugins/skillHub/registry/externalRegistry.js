const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

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

function resolveRegistryUrl(registry) {
  if (!registry) return null;
  if (registry.url) return String(registry.url);

  const owner = registry.owner;
  const repo = registry.repo;
  const branch = registry.branch || "main";
  const filePath = registry.path || "skill-hub-index.json";
  if (!owner || !repo) return null;

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

async function fetchJson(url, { timeoutMs = 15_000 } = {}) {
  const requestJson = (targetUrl, redirectsRemaining) =>
    new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (error) {
        reject(error);
        return;
      }

      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        parsed,
        { method: "GET", headers: { Accept: "application/json" } },
        (res) => {
          const status = res.statusCode || 0;
          const location = res.headers.location || null;

          if (
            status >= 300 &&
            status < 400 &&
            location &&
            redirectsRemaining > 0
          ) {
            res.resume();
            const nextUrl = new URL(location, parsed).toString();
            requestJson(nextUrl, redirectsRemaining - 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`HTTP ${status} while fetching registry index`));
            return;
          }

          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body || "null"));
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      req.on("error", reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("Request timeout"));
      });
      req.end();
    });

  return await requestJson(url, 3);
}

class ExternalRegistry {
  static KNOWN_REGISTRIES = [];

  constructor(options = {}) {
    this._bundledIndex = Array.isArray(options.bundledIndex)
      ? options.bundledIndex
      : [];
    this._cacheDir = options.cacheDir || defaultCacheDir();
    this._cacheFile = path.join(this._cacheDir, "external-index.json");
    this._registries = Array.isArray(options.registries)
      ? options.registries
      : [...ExternalRegistry.KNOWN_REGISTRIES];

    /** @type {Object[]} */
    this._index = [];
    this._loaded = false;
  }

  addRegistry(registry) {
    if (!registry) return;
    this._registries.push(registry);
  }

  setRegistries(registries) {
    this._registries = Array.isArray(registries) ? registries : [];
    return this._registries.length;
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
      } catch {
        loaded = [];
      }
    }

    // Always fallback to bundled index (offline safe).
    if (loaded.length === 0) loaded = [...this._bundledIndex];

    this._index = loaded;
    this._loaded = true;

    return this._index.length;
  }

  async refresh() {
    if (!externalDownloadsEnabled()) {
      throw new Error(
        "External registry refresh is disabled. Set SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED (or allow_all) to enable."
      );
    }

    // Fetch registry indexes (GitHub raw or explicit URL), then persist to cache.
    const registries = (this._registries || [])
      .slice()
      .sort(
        (a, b) => Number(a?.priority ?? 1000) - Number(b?.priority ?? 1000)
      );

    const merged = [];
    const seen = new Set();

    for (const registry of registries) {
      const url = resolveRegistryUrl(registry);
      if (!url) continue;

      let payload;
      try {
        payload = await fetchJson(url);
      } catch (error) {
        // Keep going; a single registry failure should not break discovery entirely.
        continue;
      }

      const skills = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.skills)
          ? payload.skills
          : [];

      for (const skill of skills) {
        const skillId = String(skill?.skillId || "").trim();
        if (!skillId) continue;
        if (seen.has(skillId)) continue;
        seen.add(skillId);

        merged.push({
          ...skill,
          // Ensure registry-provided metadata has a predictable shape
          sourceType: skill.sourceType || registry.sourceType || "external",
          sourceUrl: skill.sourceUrl || url,
          registry: registry.name || registry.repo || registry.url || null,
        });
      }
    }

    // If no registries returned data, keep existing index (cache/bundled) intact.
    if (merged.length > 0) {
      this._index = merged;
      this._loaded = true;
    }

    ensureDir(this._cacheDir);
    try {
      fs.writeFileSync(this._cacheFile, JSON.stringify(this._index, null, 2));
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

  async listSkills({ source = null, category = null } = {}) {
    await this.loadIndex();
    const sourceKey = source ? String(source).toLowerCase() : null;
    const categoryKey = category ? String(category).toLowerCase() : null;

    return this._index.filter((skill) => {
      if (
        sourceKey &&
        String(skill.sourceType || "").toLowerCase() !== sourceKey
      )
        return false;
      if (
        categoryKey &&
        String(skill.category || "").toLowerCase() !== categoryKey
      )
        return false;
      return true;
    });
  }

  listSources() {
    return {
      cacheDir: normalizePosix(this._cacheDir),
      registries: this._registries,
    };
  }
}

module.exports = { ExternalRegistry };
