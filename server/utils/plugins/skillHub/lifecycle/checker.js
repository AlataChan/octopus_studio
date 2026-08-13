const http = require("http");
const https = require("https");

const { generateContentHash } = require("../../MarkdownParser");

function parseGitHubUrl(githubUrl) {
  const raw = String(githubUrl || "").trim();
  if (!raw) return null;

  if (raw.startsWith("git@github.com:")) {
    const parts = raw.replace("git@github.com:", "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  }

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

class SkillChecker {
  constructor({ localRegistry, fetchText } = {}) {
    if (!localRegistry) throw new Error("SkillChecker requires localRegistry");
    this.localRegistry = localRegistry;
    this.fetchText = fetchText || defaultFetchText;
  }

  async check(skillId) {
    await this.localRegistry.scan();
    const skill = this.localRegistry.get(skillId);
    if (!skill) {
      return { skillId, status: "error", error: `Skill not found: ${skillId}` };
    }

    if (String(skill.sourceType || "").toLowerCase() !== "github") {
      return {
        skillId,
        status: "error",
        error: "Skill is not a GitHub-sourced skill",
      };
    }

    const parsed = parseGitHubUrl(skill.sourceUrl);
    if (!parsed) {
      return {
        skillId,
        status: "error",
        error: "Invalid sourceUrl for GitHub skill",
      };
    }

    const currentHash = skill.sourceHash || skill.contentHash || null;
    const branches = ["main", "master"];

    let remoteSkillMd = null;
    for (const branch of branches) {
      const url = buildRawUrl({
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        filePath: "skill.md",
      });
      try {
        remoteSkillMd = await this.fetchText(url);
        break;
      } catch {
        // keep trying
      }
    }

    if (!remoteSkillMd) {
      return {
        skillId,
        status: "error",
        currentHash,
        remoteHash: null,
        error: "Failed to fetch remote skill.md",
      };
    }

    const remoteHash = generateContentHash(remoteSkillMd);
    const status =
      currentHash && currentHash === remoteHash ? "current" : "outdated";
    return { skillId, status, currentHash, remoteHash };
  }

  async checkAll() {
    await this.localRegistry.scan();
    const results = [];
    for (const skill of this.localRegistry._skills || []) {
      if (String(skill.sourceType || "").toLowerCase() !== "github") continue;
      results.push(await this.check(skill.skillId));
    }
    return results;
  }
}

module.exports = { SkillChecker };
