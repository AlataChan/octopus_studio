const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const yaml = require("js-yaml");

const {
  generateContentHash,
  parseFrontmatter,
} = require("../../MarkdownParser");
const { PLUGINS_BASE_PATH, PLUGIN_DIRECTORIES } = require("../../constants");
const { writeFileAtomic } = require("../format/writeFileAtomic");
const {
  assertArbitraryGitHubUrlAllowed,
} = require("../security/externalDownloadPolicy");

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/\.git$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function parseGitHubUrl(githubUrl) {
  const raw = String(githubUrl || "").trim();
  if (!raw) return null;

  // git@github.com:owner/repo(.git)
  if (raw.startsWith("git@github.com:")) {
    const parts = raw.replace("git@github.com:", "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  // https://github.com/owner/repo(.git)
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function defaultFetchText(url, { timeoutMs = 15_000 } = {}) {
  const requestText = (targetUrl, redirectsRemaining) =>
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
        { method: "GET", headers: { Accept: "text/plain" } },
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
            requestText(nextUrl, redirectsRemaining - 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }

          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(body));
        }
      );

      req.on("error", reject);
      req.setTimeout(timeoutMs, () =>
        req.destroy(new Error("Request timeout"))
      );
      req.end();
    });

  return requestText(url, 3);
}

function buildRawUrl({ owner, repo, branch, filePath }) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

function compactDescriptionFromReadme(readme) {
  const lines = String(readme || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  // Prefer first non-heading line. If all headings, fallback to first line.
  const nonHeading = lines.find((l) => !l.startsWith("#"));
  return nonHeading || lines[0] || "";
}

function buildSkillMd({ frontmatter, body }) {
  const fm = { ...(frontmatter || {}) };
  const dumped = yaml.dump(fm, { lineWidth: -1 }).trimEnd();
  const content = String(body || "").trim();
  return `---\n${dumped}\n---\n\n${content}\n`;
}

function tryRemoveDir(dirPath) {
  if (!dirPath) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

class SkillCreator {
  constructor(options = {}) {
    this.fetchText = options.fetchText || defaultFetchText;
    this.defaultOutputDir =
      options.defaultOutputDir ||
      path.join(PLUGINS_BASE_PATH, PLUGIN_DIRECTORIES.skills);
  }

  async createFromGitHub(githubUrl, options = {}) {
    // Creating from an arbitrary GitHub URL is considered high-risk; require explicit allow_all
    // unless the caller has already verified the source (e.g., coming from a verified registry item).
    const isVerified = options.verified === true;
    assertArbitraryGitHubUrlAllowed({ verified: isVerified });

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) throw new Error("Invalid GitHub URL");

    const { owner, repo } = parsed;
    const skillSlug = safeSlug(repo) || safeSlug(`${owner}-${repo}`) || "skill";

    const outputDir = options.outputDir || this.defaultOutputDir;
    ensureDir(outputDir);

    const finalSkillDir = path.join(outputDir, skillSlug);
    const finalSkillMdPath = path.join(finalSkillDir, "skill.md");

    if (fs.existsSync(finalSkillDir) && !options.overwrite) {
      throw new Error(`Skill directory already exists: ${finalSkillDir}`);
    }

    let tempSkillDir = null;
    let backupDir = null;

    try {
      tempSkillDir = fs.mkdtempSync(
        path.join(outputDir, `.tmp-skillhub-${skillSlug}-`)
      );

      ensureDir(path.join(tempSkillDir, "scripts"));

      const branches = ["main", "master"];
      const tryFetch = async (filePath) => {
        for (const branch of branches) {
          const url = buildRawUrl({ owner, repo, branch, filePath });
          try {
            return await this.fetchText(url);
          } catch {
            // continue
          }
        }
        return null;
      };

      const remoteSkillMd = await tryFetch("skill.md");

      let skillMdContent = null;
      if (remoteSkillMd) {
        const { data: fm, content: body } = parseFrontmatter(remoteSkillMd);
        const merged = {
          ...fm,
          name: fm.name || repo,
          description: fm.description || "",
          tools:
            Array.isArray(fm.tools) && fm.tools.length > 0
              ? fm.tools
              : ["http-request"],
          sourceType: "github",
          sourceUrl: String(githubUrl),
          sourceHash: generateContentHash(remoteSkillMd),
          verified: isVerified ? true : fm.verified === true,
        };
        skillMdContent = buildSkillMd({ frontmatter: merged, body });
      } else {
        const readme =
          (await tryFetch("README.md")) || (await tryFetch("readme.md")) || "";

        const description =
          compactDescriptionFromReadme(readme) ||
          `Imported from ${owner}/${repo}`;
        const maxChars = Number.isFinite(options.readmeMaxChars)
          ? Number(options.readmeMaxChars)
          : 6_000;
        const clippedReadme =
          readme && maxChars > 0 ? String(readme).slice(0, maxChars) : "";

        const frontmatter = {
          name: repo,
          description,
          tools: ["http-request"],
          sourceType: "github",
          sourceUrl: String(githubUrl),
          sourceHash: generateContentHash(readme || `${owner}/${repo}`),
          verified: isVerified,
        };

        const body = clippedReadme
          ? `# Imported Skill\n\n${clippedReadme}`
          : `# Imported Skill\n\nImported from ${owner}/${repo}.`;

        skillMdContent = buildSkillMd({ frontmatter, body });
      }

      const tempSkillMdPath = path.join(tempSkillDir, "skill.md");
      writeFileAtomic(tempSkillMdPath, skillMdContent, { encoding: "utf8" });
      writeFileAtomic(
        path.join(tempSkillDir, "evolution.json"),
        JSON.stringify({ version: 1, entries: [] }, null, 2),
        { encoding: "utf8" }
      );

      // If overwriting, move existing skill dir aside first. Only do this once
      // we've fully materialized the new skill in a temp directory.
      if (fs.existsSync(finalSkillDir)) {
        backupDir = path.join(
          outputDir,
          `.backup-skillhub-${skillSlug}-${Date.now()}`
        );
        fs.renameSync(finalSkillDir, backupDir);
      }

      fs.renameSync(tempSkillDir, finalSkillDir);
      tempSkillDir = null;

      // Delete backup only after successful move.
      if (backupDir) {
        tryRemoveDir(backupDir);
        backupDir = null;
      }

      const skillId = `custom:${skillSlug}`;
      return {
        skillId,
        skillDir: finalSkillDir,
        skillMdPath: finalSkillMdPath,
      };
    } catch (error) {
      // Best-effort rollback for overwrite operations.
      tryRemoveDir(tempSkillDir);

      if (backupDir) {
        try {
          if (!fs.existsSync(finalSkillDir) && fs.existsSync(backupDir)) {
            fs.renameSync(backupDir, finalSkillDir);
          }
        } catch {
          // ignore
        }
      }

      throw error;
    }
  }
}

module.exports = { SkillCreator };
