const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const yaml = require("js-yaml");

const {
  generateContentHash,
  parseFrontmatter,
} = require("../../MarkdownParser");
const { stitchEvolution } = require("../format/skillMdStitcher");
const { writeFileAtomic } = require("../format/writeFileAtomic");
const {
  assertExternalDownloadsEnabled,
  assertVerifiedOrAllowAll,
} = require("../security/externalDownloadPolicy");
const {
  ensureDir,
  downloadToFile,
  sha256File,
  safeExtractZip,
  findSkillRoot,
  resolveUrlMaybeRelative,
  writeSkillFrontmatterOverrides,
} = require("../gitRegistry/bundleTransport");

const EVOLUTION_START = "<!-- SKILL_EVOLUTION_START -->";
const EVOLUTION_END = "<!-- SKILL_EVOLUTION_END -->";

function safeJsonParse(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

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

function resolveSkillAbsolutePath(localRegistry, skill) {
  const originPath = String(skill?.originPath || "").trim();
  if (!originPath) return null;

  const baseRoot =
    skill.sourceType === "builtin"
      ? localRegistry.builtinBaseRoot
      : localRegistry.customBaseRoot;

  return path.join(baseRoot, originPath);
}

function buildSkillMd({ frontmatter, body }) {
  const fm = { ...(frontmatter || {}) };
  const dumped = yaml.dump(fm, { lineWidth: -1 }).trimEnd();
  const content = String(body || "").trim();
  return `---\n${dumped}\n---\n\n${content}\n`;
}

function stripEvolutionBlock(markdownBody) {
  const body = String(markdownBody || "");
  const startIdx = body.indexOf(EVOLUTION_START);
  const endIdx = body.indexOf(EVOLUTION_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return body.trim();
  const before = body.slice(0, startIdx);
  const after = body.slice(endIdx + EVOLUTION_END.length);
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function deepEqual(a, b) {
  return JSON.stringify(stableSort(a)) === JSON.stringify(stableSort(b));
}

function diffObjects(oldObj, newObj, { ignoreKeys = [] } = {}) {
  const ignore = new Set(ignoreKeys.map((k) => String(k)));
  const oldO = oldObj && typeof oldObj === "object" ? oldObj : {};
  const newO = newObj && typeof newObj === "object" ? newObj : {};
  const keys = new Set([...Object.keys(oldO), ...Object.keys(newO)]);

  const added = {};
  const removed = {};
  const changed = {};

  for (const key of keys) {
    if (ignore.has(key)) continue;
    const hasOld = Object.prototype.hasOwnProperty.call(oldO, key);
    const hasNew = Object.prototype.hasOwnProperty.call(newO, key);
    if (!hasOld && hasNew) {
      added[key] = newO[key];
      continue;
    }
    if (hasOld && !hasNew) {
      removed[key] = oldO[key];
      continue;
    }
    if (!deepEqual(oldO[key], newO[key])) {
      changed[key] = { from: oldO[key], to: newO[key] };
    }
  }

  return { added, removed, changed };
}

function normalizeTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list.map((t) => String(t || "").trim()).filter(Boolean);
}

function diffTools(oldTools, newTools) {
  const oldList = normalizeTools(oldTools);
  const newList = normalizeTools(newTools);
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);

  const added = newList.filter((t) => !oldSet.has(t));
  const removed = oldList.filter((t) => !newSet.has(t));
  const unchanged = newList.filter((t) => oldSet.has(t));

  return { old: oldList, new: newList, added, removed, unchanged };
}

function computeRisk({ tools, frontmatter }) {
  const flags = [];
  if (tools.added.length > 0) flags.push("new_tools");
  if (tools.removed.length > 0) flags.push("removed_tools");

  const perm = frontmatter.changed?.permissionMode;
  const autoApproved = frontmatter.changed?.autoApprovedTools;
  if (perm && String(perm?.to || "").toLowerCase() === "bypass") {
    flags.push("permission_mode_bypass");
  }
  if (
    autoApproved &&
    Array.isArray(autoApproved?.to) &&
    autoApproved.to.length > 0
  ) {
    flags.push("auto_approved_tools_added");
  }

  const level =
    flags.includes("permission_mode_bypass") ||
    flags.includes("auto_approved_tools_added")
      ? "high"
      : flags.length > 0
        ? "medium"
        : "low";

  return { level, flags };
}

class SkillUpgrader {
  constructor({ localRegistry, fetchText } = {}) {
    if (!localRegistry) throw new Error("SkillUpgrader requires localRegistry");
    this.localRegistry = localRegistry;
    this.fetchText = fetchText || defaultFetchText;
  }

  async upgrade(skillId, options = {}) {
    await this.localRegistry.scan();
    const skill = this.localRegistry.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    if (skill.sourceType === "builtin") {
      throw new Error("Cannot upgrade builtin skills (read-only)");
    }

    const sourceType = String(skill.sourceType || "").toLowerCase();
    if (!["github", "registry"].includes(sourceType)) {
      throw new Error("Skill is not upgradable (only github/registry)");
    }

    // P1.1: supply-chain gate. Upgrading external skills requires explicit enablement.
    assertExternalDownloadsEnabled({ operation: "upgrade external Skills" });
    assertVerifiedOrAllowAll(skill, { operation: "upgrade" });

    const oldHash = skill.sourceHash || skill.contentHash || null;

    const skillMdPath = resolveSkillAbsolutePath(this.localRegistry, skill);
    if (!skillMdPath) throw new Error("Failed to resolve skill.md path");

    let remoteSkillMd = null;
    let newHash = null;
    let bundleWorkDir = null;
    let bundleZipPath = null;
    let bundleRootDir = null;

    if (sourceType === "github") {
      const parsed = parseGitHubUrl(skill.sourceUrl);
      if (!parsed) throw new Error("Invalid sourceUrl for GitHub skill");

      const branches = ["main", "master"];
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

      if (!remoteSkillMd) throw new Error("Failed to fetch remote skill.md");
      newHash = generateContentHash(remoteSkillMd);
    } else if (sourceType === "registry") {
      const bundleUrl = resolveUrlMaybeRelative(skill.sourceUrl, null);
      if (!bundleUrl)
        throw new Error("Invalid sourceUrl for registry bundle skill");

      const skillDir = path.dirname(skillMdPath);
      const parentDir = path.dirname(skillDir);
      ensureDir(parentDir);

      bundleWorkDir = fs.mkdtempSync(
        path.join(
          parentDir,
          `.tmp-registry-upgrade-${path.basename(skillDir)}-`
        )
      );
      bundleZipPath = path.join(bundleWorkDir, "bundle.zip");
      const extractDir = path.join(bundleWorkDir, "extract");
      ensureDir(extractDir);

      await downloadToFile(bundleUrl, bundleZipPath);
      const zipHash = sha256File(bundleZipPath);
      newHash = `sha256:${zipHash}`;

      safeExtractZip(bundleZipPath, extractDir);
      bundleRootDir = findSkillRoot(extractDir);
      if (!bundleRootDir)
        throw new Error("Bundle did not contain a valid skill.md root");

      remoteSkillMd = fs.readFileSync(
        path.join(bundleRootDir, "skill.md"),
        "utf8"
      );
    }

    let localSkillMdContent = "";
    try {
      localSkillMdContent = fs.readFileSync(skillMdPath, "utf8");
    } catch {
      localSkillMdContent = "";
    }

    const { data: localFm, content: localBodyRaw } =
      parseFrontmatter(localSkillMdContent);
    const { data: remoteFm, content: remoteBodyRaw } =
      parseFrontmatter(remoteSkillMd);

    const localBody = stripEvolutionBlock(localBodyRaw);
    const remoteBody = stripEvolutionBlock(remoteBodyRaw);

    const tools = diffTools(
      localFm.tools || skill.tools || [],
      remoteFm.tools || []
    );
    const frontmatter = diffObjects(localFm, remoteFm, {
      ignoreKeys: [
        "sourceHash",
        "sourceType",
        "sourceUrl",
        "lastCheckedAt",
        "latestVersion",
      ],
    });

    const changes = {
      wouldUpdate:
        sourceType === "registry"
          ? String(oldHash || "").replace(/^sha256:/i, "") !==
            String(newHash || "").replace(/^sha256:/i, "")
          : oldHash !== newHash,
      frontmatter,
      tools,
      prompt: {
        oldHash: generateContentHash(localBody),
        newHash: generateContentHash(remoteBody),
        changed: !deepEqual(localBody, remoteBody),
        oldChars: localBody.length,
        newChars: remoteBody.length,
      },
      risk: computeRisk({ tools, frontmatter }),
    };

    if (options.dryRun) {
      if (bundleWorkDir) {
        try {
          fs.rmSync(bundleWorkDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
      return {
        upgraded: false,
        oldHash,
        newHash,
        changes,
      };
    }

    if (sourceType === "registry") {
      const wouldUpdate = changes.wouldUpdate === true;
      if (!wouldUpdate) {
        if (bundleWorkDir) {
          try {
            fs.rmSync(bundleWorkDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
        return { upgraded: false, oldHash, newHash, changes };
      }

      const skillDir = path.dirname(skillMdPath);
      const evolutionPath = path.join(skillDir, "evolution.json");
      const evolution = fs.existsSync(evolutionPath)
        ? safeJsonParse(fs.readFileSync(evolutionPath, "utf8"), null)
        : null;

      try {
        // Preserve local evolution into the new bundle and re-stitch.
        if (evolution && bundleRootDir) {
          writeFileAtomic(
            path.join(bundleRootDir, "evolution.json"),
            JSON.stringify(evolution, null, 2),
            { encoding: "utf8" }
          );
          const stitched = stitchEvolution(remoteSkillMd, evolution);
          writeFileAtomic(path.join(bundleRootDir, "skill.md"), stitched, {
            encoding: "utf8",
          });
        }

        writeSkillFrontmatterOverrides(path.join(bundleRootDir, "skill.md"), {
          sourceType: "registry",
          sourceUrl: String(skill.sourceUrl),
          sourceHash: String(newHash),
          verified: skill.verified === true,
        });

        // Atomically replace the skill directory.
        const parentDir = path.dirname(skillDir);
        let backupDir = null;
        backupDir = path.join(
          parentDir,
          `.backup-registry-upgrade-${path.basename(skillDir)}-${Date.now()}`
        );
        fs.renameSync(skillDir, backupDir);

        try {
          fs.renameSync(bundleRootDir, skillDir);
        } catch (error) {
          // rollback
          try {
            if (!fs.existsSync(skillDir) && fs.existsSync(backupDir)) {
              fs.renameSync(backupDir, skillDir);
              backupDir = null;
            }
          } catch {
            // ignore
          }
          throw error;
        }

        if (backupDir) {
          try {
            fs.rmSync(backupDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }

        return {
          upgraded: true,
          oldHash,
          newHash,
          changes: {
            ...changes,
            updatedSkillMdPath: path.join(skillDir, "skill.md"),
            evolutionPath: evolution ? evolutionPath : null,
          },
        };
      } finally {
        if (bundleWorkDir) {
          try {
            fs.rmSync(bundleWorkDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      }
    }

    const skillDir = path.dirname(skillMdPath);
    const evolutionPath = path.join(skillDir, "evolution.json");
    const evolution = fs.existsSync(evolutionPath)
      ? safeJsonParse(fs.readFileSync(evolutionPath, "utf8"), null)
      : null;

    const { data: fm, content: body } = parseFrontmatter(remoteSkillMd);
    const merged = {
      ...fm,
      name: fm.name || skill.name,
      description: fm.description || skill.description || "",
      tools:
        Array.isArray(fm.tools) && fm.tools.length > 0
          ? fm.tools
          : skill.tools || ["http-request"],
      sourceType: "github",
      sourceUrl: skill.sourceUrl,
      sourceHash: newHash,
      // Preserve local trust classification; do not auto-promote from upstream content.
      verified: skill.verified === true,
    };

    let updatedSkillMd = buildSkillMd({ frontmatter: merged, body });
    if (evolution) {
      updatedSkillMd = stitchEvolution(updatedSkillMd, evolution);
    }

    writeFileAtomic(skillMdPath, updatedSkillMd, { encoding: "utf8" });

    return {
      upgraded: oldHash !== newHash,
      oldHash,
      newHash,
      changes: {
        ...changes,
        updatedSkillMdPath: skillMdPath,
        evolutionPath: evolution ? evolutionPath : null,
      },
    };
  }
}

module.exports = { SkillUpgrader };
