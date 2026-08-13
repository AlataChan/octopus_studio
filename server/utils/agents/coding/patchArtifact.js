const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

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

function posixRelative(root, targetPath) {
  return path.relative(root, targetPath).split(path.sep).join("/");
}

function isUnderRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function walkFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolutePath = path.join(dir, entry.name);
      if (!isUnderRoot(path.resolve(absolutePath), path.resolve(root))) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        out.push(absolutePath);
      }
    }
  }
  await walk(root);
  return out;
}

function isLikelyBinary(filePath, maxProbeBytes = 8192) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxProbeBytes);
    const bytes = fs.readSync(fd, buffer, 0, maxProbeBytes, 0);
    return buffer.subarray(0, bytes).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

async function skippedFiles(root, maxPatchFileBytes) {
  const skipped = [];
  for (const file of await walkFiles(root)) {
    const stat = await fsp.stat(file);
    if (stat.size > maxPatchFileBytes || isLikelyBinary(file)) {
      skipped.push(posixRelative(root, file));
    }
  }
  return skipped;
}

function splitDiffBlocks(diffText) {
  const blocks = [];
  let current = [];
  for (const line of String(diffText || "").split("\n")) {
    if (line.startsWith("diff --git ") && current.length) {
      blocks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length && current.some((line) => line.trim())) blocks.push(current.join("\n"));
  return blocks;
}

function blockTouchesSkipped(block, skipped) {
  return skipped.some((file) => {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)(a/|b/)?${escaped}(\\s|$)`).test(block);
  });
}

async function gitPatch({ sandboxPath, maxPatchFileBytes }) {
  const skipped = await skippedFiles(sandboxPath, maxPatchFileBytes);
  await execFileP("git", ["-C", sandboxPath, "add", "-A", "-N"]);
  const { stdout } = await execFileP("git", ["-C", sandboxPath, "diff", "-M", "--binary", "HEAD"]);
  const text = splitDiffBlocks(stdout)
    .filter((block) => !blockTouchesSkipped(block, skipped))
    .join("\n");
  return {
    text,
    sizeBytes: Buffer.byteLength(text),
    format: "unified_diff",
    changedFiles: splitDiffBlocks(text).length,
    metadata: { mode: "git", skippedFiles: skipped },
  };
}

async function baselineMapPatch({ runtime }) {
  if (!runtime || typeof runtime.createPatch !== "function") {
    throw new Error("baseline-map patch mode requires the shared LocalExecutionRuntime");
  }
  const patch = await runtime.createPatch();
  return {
    ...patch,
    metadata: { mode: "baseline-map", skippedFiles: [] },
  };
}

async function generatePatchArtifact({
  workspace,
  runtime = null,
  forceBaselineMap = false,
  maxPatchFileBytes = 256 * 1024,
} = {}) {
  if (!workspace?.sandboxPath) throw new Error("workspace.sandboxPath is required");
  if (forceBaselineMap) return baselineMapPatch({ runtime });
  try {
    await execFileP("git", ["-C", workspace.sandboxPath, "rev-parse", "--verify", "HEAD"]);
    return await gitPatch({ sandboxPath: workspace.sandboxPath, maxPatchFileBytes });
  } catch {
    return baselineMapPatch({ runtime });
  }
}

module.exports = {
  generatePatchArtifact,
  _test: {
    splitDiffBlocks,
  },
};
