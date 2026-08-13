#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const whitelist = require("./whitelist.json");
const toolMapping = require("./tool-mapping.json");
const wave1 = require("./wave1.json");
const { parseMarkdown } = require("./parse-markdown");
const { extractSkills } = require("./extract-skills");
const {
  applyRenderSafeFallbacks,
  validateRenderSafe,
} = require("./render-safe");
const { translateName } = require("./translate-name");

const WAVE_MANIFESTS = {
  "1": wave1,
};

function getAssistantTemplateModel() {
  return require("../../server/models/assistantTemplate").AssistantTemplate;
}

function normalizeRelativePath(input) {
  return String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");
}

/**
 * Parse CLI arguments for importer execution.
 *
 * @param {string[]} argv
 * @returns {{dryRun: boolean, forceUpdate: boolean, division: string|null, file: string|null, wave: string|null}}
 */
function parseArgs(argv = []) {
  const args = {
    dryRun: false,
    forceUpdate: false,
    division: null,
    file: null,
    wave: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (value === "--force-update") {
      args.forceUpdate = true;
      continue;
    }

    if (value.startsWith("--division=")) {
      args.division = value.split("=")[1] || null;
      continue;
    }

    if (value === "--division") {
      args.division = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (value.startsWith("--file=")) {
      args.file = normalizeRelativePath(value.split("=")[1] || null);
      continue;
    }

    if (value === "--file") {
      args.file = normalizeRelativePath(argv[index + 1] || null);
      index += 1;
      continue;
    }

    if (value.startsWith("--wave=")) {
      args.wave = value.split("=")[1] || null;
      continue;
    }

    if (value === "--wave") {
      args.wave = argv[index + 1] || null;
      index += 1;
    }
  }

  return args;
}

function runGit(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }).trim();
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    const stdout = String(error.stdout || "").trim();
    const detail = stderr || stdout || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

/**
 * Clone or refresh the upstream repository into a local temp directory.
 *
 * @param {string} targetDir
 * @param {string} repoUrl
 * @param {string} branch
 * @returns {string}
 */
function ensureRepo(targetDir, repoUrl, branch) {
  try {
    if (fs.existsSync(path.join(targetDir, ".git"))) {
      runGit(["fetch", "origin"], targetDir);
      runGit(["reset", "--hard", `origin/${branch}`], targetDir);
    } else {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      execFileSync(
        "git",
        ["clone", "--depth=1", `--branch=${branch}`, repoUrl, targetDir],
        {
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
        }
      );
    }

    return runGit(["rev-parse", "--short", "HEAD"], targetDir);
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(`Failed to prepare upstream repository: ${detail}`);
  }
}

function buildSourceUrl(repoUrl, branch, relativePath) {
  const normalizedRepo = String(repoUrl || "").replace(/\.git$/, "");
  return `${normalizedRepo}/blob/${branch}/${normalizeRelativePath(relativePath)}`;
}

/**
 * Determine whether a relative upstream markdown path is part of the curated import.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function isIncluded(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const [division, file] = normalized.split("/", 2);

  if (!division || !file) return false;
  if (whitelist.excludeDivisions.includes(division)) return false;

  if (division === "specialized") {
    return whitelist.specializedOnly.includes(file);
  }

  if (!whitelist.includeDivisions.includes(division)) return false;

  const excludes = whitelist.divisionExcludes[division] || [];
  return !excludes.includes(file);
}

/**
 * Advisory tool extraction from markdown body content.
 *
 * @param {string} body
 * @returns {string[]}
 */
function extractTools(body) {
  const lower = String(body || "").toLowerCase();
  const tools = new Set();

  for (const [keyword, mappedTools] of Object.entries(toolMapping.rules)) {
    if (!lower.includes(keyword)) continue;
    for (const tool of mappedTools) {
      tools.add(tool);
    }
  }

  return Array.from(tools).sort();
}

function detectDangerousKeywords(body) {
  const lower = String(body || "").toLowerCase();
  return toolMapping.dangerousKeywords.filter((keyword) =>
    lower.includes(keyword.toLowerCase())
  );
}

function computeAutoApproved(tools) {
  return tools.filter((tool) =>
    toolMapping.autoApprovedAllowlist.includes(tool)
  );
}

function getWaveFileSet(wave) {
  if (!wave) return null;

  const manifest = WAVE_MANIFESTS[String(wave)];
  if (!manifest) {
    throw new Error(`Unsupported wave: ${wave}`);
  }

  return new Set(manifest.files.map(normalizeRelativePath));
}

/**
 * Build the import payload for a single markdown file.
 *
 * @param {string} filePath
 * @param {string} relativePath
 * @param {string} commitHash
 * @param {Object} args
 * @param {{AssistantTemplate?: Object, llmCaller?: Function}} [deps]
 * @returns {Promise<{action: string, template?: Object|null, message?: string, row?: Object, warnings?: string[]}>}
 */
async function processFile(
  filePath,
  relativePath,
  commitHash,
  args = {},
  deps = {}
) {
  const { frontmatter, body } = parseMarkdown(filePath);
  const division = normalizeRelativePath(relativePath).split("/")[0];
  const englishName = String(frontmatter.name || "Unnamed").trim() || "Unnamed";
  const translatedName = await translateName(englishName, deps.llmCaller);
  const contentHash = crypto
    .createHash("sha256")
    .update(body, "utf8")
    .digest("hex");
  const tools = extractTools(body);
  const autoApproved = computeAutoApproved(tools);
  const skills = extractSkills(body, division);
  const dangerousKeywords = detectDangerousKeywords(body);
  const warnings = [];

  if (dangerousKeywords.length > 0) {
    warnings.push(
      `${relativePath}: dangerous capability keywords detected (${dangerousKeywords.join(", ")})`
    );
  }

  const row = {
    name: translatedName,
    description: frontmatter.description || "(无描述)",
    category: division,
    tags: frontmatter.tags || [],
    icon: frontmatter.emoji || "🤖",
    vibe: frontmatter.vibe || null,
    color: frontmatter.color || "#3B82F6",
    systemPrompt: body,
    sourceType: "markdown",
    pluginType: "agent",
    version: "1.0.0",
    contentHash,
    originPath: normalizeRelativePath(relativePath),
    sourceUrl: buildSourceUrl(
      whitelist.upstream.repo,
      whitelist.upstream.branch,
      relativePath
    ),
    sourceLicense: whitelist.upstream.license,
    sourceCommit: commitHash,
    defaultPermissionMode: "default",
    defaultTools: tools,
    defaultAllowedTools: tools,
    defaultAutoApprovedTools: autoApproved,
    employeeName: translatedName,
    employeeTitle: `${division} 专家`,
    employeeBio: String(frontmatter.description || "").slice(0, 200),
    skills,
    platformType: "internal",
    knowledgeModeTemplate: "workspace",
    isGlobal: true,
    isDefault: false,
  };

  const safeRow = applyRenderSafeFallbacks(row);
  const validation = validateRenderSafe(safeRow);

  if (!validation.valid) {
    return {
      action: "error",
      message: validation.errors.join(", "),
      warnings,
    };
  }

  if (args.dryRun) {
    return {
      action: "dry-run",
      row: safeRow,
      warnings,
    };
  }

  const AssistantTemplate = deps.AssistantTemplate || getAssistantTemplateModel();
  const result = await AssistantTemplate.upsertByOriginPath(safeRow);

  if (
    args.forceUpdate &&
    result.action === "skip" &&
    result.template &&
    result.template.id
  ) {
    const forced = await AssistantTemplate.update(result.template.id, safeRow);
    return forced.template
      ? { action: "update", template: forced.template, warnings }
      : {
          action: "error",
          template: null,
          message: forced.message || "force update failed",
          warnings,
        };
  }

  return { ...result, warnings };
}

function listDivisionFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Execute the importer run.
 *
 * @param {Object} args
 * @param {{repoDir?: string, commitHash?: string, AssistantTemplate?: Object, llmCaller?: Function}} [deps]
 * @returns {Promise<Object>}
 */
async function run(args = {}, deps = {}) {
  const repoDir =
    deps.repoDir || path.resolve(__dirname, ".tmp-agency-agents");
  const commitHash =
    deps.commitHash ||
    ensureRepo(repoDir, whitelist.upstream.repo, whitelist.upstream.branch);
  const waveFiles = getWaveFileSet(args.wave);
  const report = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    dryRun: 0,
    errors: 0,
    warnings: [],
  };

  const divisions = [...whitelist.includeDivisions, "specialized"];

  for (const division of divisions) {
    if (args.division && args.division !== division) continue;

    const dirPath = path.join(repoDir, division);
    for (const file of listDivisionFiles(dirPath)) {
      const relativePath = normalizeRelativePath(`${division}/${file}`);

      if (!isIncluded(relativePath)) continue;
      if (args.file && args.file !== relativePath) continue;
      if (waveFiles && !waveFiles.has(relativePath)) continue;

      report.total += 1;

      try {
        const result = await processFile(
          path.join(dirPath, file),
          relativePath,
          commitHash,
          args,
          deps
        );

        if (Array.isArray(result.warnings) && result.warnings.length > 0) {
          report.warnings.push(...result.warnings);
        }

        if (result.action === "create") report.created += 1;
        else if (result.action === "update") report.updated += 1;
        else if (result.action === "skip") report.skipped += 1;
        else if (result.action === "dry-run") report.dryRun += 1;
        else if (result.action === "error") {
          report.errors += 1;
          report.warnings.push(
            `${relativePath}: ${result.message || "unknown import error"}`
          );
        }
      } catch (error) {
        report.errors += 1;
        report.warnings.push(`${relativePath}: ${error.message}`);
      }
    }
  }

  console.log("\n=== Import Report ===");
  console.log(JSON.stringify(report, null, 2));

  return report;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  run(args).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  run,
  parseArgs,
  ensureRepo,
  processFile,
  isIncluded,
  extractTools,
  computeAutoApproved,
  detectDangerousKeywords,
};
