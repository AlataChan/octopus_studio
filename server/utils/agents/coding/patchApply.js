const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const ToolDescriptor = require("../runtime/toolDescriptor");
const { RiskLevel } = require("../../permissions/constants");

function execFileP(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function isSafeRelativePath(filePath) {
  return (
    filePath &&
    filePath !== "/dev/null" &&
    !path.isAbsolute(filePath) &&
    !filePath.split(/[\\/]/).includes("..")
  );
}

function normalizeDiffPath(filePath) {
  if (!filePath || filePath === "/dev/null") return null;
  return filePath.replace(/^(a|b)\//, "");
}

function parseTouchedFiles(patchText) {
  const touched = new Set();
  for (const line of String(patchText || "").split("\n")) {
    const match = /^diff --git\s+(.+?)\s+(.+)$/.exec(line);
    if (!match) continue;
    for (const rawPath of [match[1], match[2]]) {
      const normalized = normalizeDiffPath(rawPath);
      if (normalized && isSafeRelativePath(normalized)) touched.add(normalized);
    }
  }
  return Array.from(touched).sort();
}

function driftedTouchedFiles({ sourceRepoPath, manifest, touchedFiles }) {
  const drifted = [];
  for (const relativePath of touchedFiles) {
    const sourcePath = path.join(sourceRepoPath, relativePath);
    const expectedHash = manifest.files?.[relativePath] || null;
    const exists = fs.existsSync(sourcePath);
    if (!expectedHash) {
      if (exists) drifted.push(relativePath);
      continue;
    }
    if (!exists || sha256File(sourcePath) !== expectedHash) {
      drifted.push(relativePath);
    }
  }
  return drifted;
}

function checkApproval(approval) {
  return approval?.approved === true;
}

function conflictResult(error) {
  const detail = `${error?.stderr || error?.stdout || error?.message || error}`.trim();
  return {
    applied: false,
    status: "conflict",
    reason: `git apply --check failed${detail ? `: ${detail}` : ""}`,
  };
}

function resolveApplyBackContext({ workspace, patchArtifact }) {
  const manifest =
    workspace?.manifest ||
    patchArtifact?.metadata?.manifest ||
    patchArtifact?.manifest ||
    null;
  const sourceRepoPath =
    workspace?.sourceRepoPath ||
    manifest?.sourceRepoPath ||
    workspace?.manifest?.sourceRepoPath ||
    null;
  return { manifest, sourceRepoPath };
}

async function withPatchFile(patchText, fn) {
  const patchFile = path.join(
    os.tmpdir(),
    `octopus-coding-apply-back-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.diff`
  );
  await fsp.writeFile(patchFile, patchText, "utf8");
  try {
    return await fn(patchFile);
  } finally {
    await fsp.rm(patchFile, { force: true });
  }
}

async function applyPatchBack({
  workspace,
  patchArtifact,
  patchText = null,
  approval = null,
  conflictPolicy = "refuse",
  afterCheck = null,
} = {}) {
  if (!checkApproval(approval)) {
    return {
      applied: false,
      status: "approval_required",
      reason: "coding_patch_apply requires explicit approval",
    };
  }
  const { manifest, sourceRepoPath } = resolveApplyBackContext({ workspace, patchArtifact });
  if (!sourceRepoPath || !manifest?.files) {
    return {
      applied: false,
      status: "manifest_unavailable",
      reason: "Source manifest is required for safe apply-back",
    };
  }
  const text = patchText || patchArtifact?.text || "";
  const touchedFiles = parseTouchedFiles(text);
  const driftedFiles = driftedTouchedFiles({ sourceRepoPath, manifest, touchedFiles });
  if (driftedFiles.length) {
    return {
      applied: false,
      status: "drift",
      driftedFiles,
      reason: "Touched source files changed after sandbox creation",
    };
  }

  return withPatchFile(text, async (patchFile) => {
    try {
      await execFileP("git", ["-C", sourceRepoPath, "apply", "--check", patchFile]);
    } catch (error) {
      if (conflictPolicy !== "allow") return conflictResult(error);
      throw error;
    }
    if (typeof afterCheck === "function") await afterCheck();
    const driftedAfterCheck = driftedTouchedFiles({ sourceRepoPath, manifest, touchedFiles });
    if (driftedAfterCheck.length) {
      return {
        applied: false,
        status: "drift",
        driftedFiles: driftedAfterCheck,
        reason: "Touched source files changed after git apply --check",
      };
    }
    await execFileP("git", ["-C", sourceRepoPath, "apply", patchFile]);
    return {
      applied: true,
      status: "applied",
      touchedFiles,
      sourceHeadAtCopy: manifest.sourceHead || null,
    };
  });
}

function createPatchApplyTool({ workspace } = {}) {
  return new ToolDescriptor({
    name: "coding_patch_apply",
    description: "Apply an approved coding-agent patch back to the source repo.",
    riskLevel: RiskLevel.WRITE,
    isReadOnly: false,
    isDestructive: true,
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string" },
        approved: { type: "boolean" },
        conflictPolicy: { type: "string" },
      },
      required: ["patch", "approved"],
      additionalProperties: false,
    },
    handler: async ({ patch, approved, conflictPolicy }) =>
      applyPatchBack({
        workspace,
        patchText: patch,
        approval: { approved },
        conflictPolicy,
      }),
  });
}

module.exports = {
  applyPatchBack,
  createPatchApplyTool,
  _test: {
    parseTouchedFiles,
    driftedTouchedFiles,
  },
};
