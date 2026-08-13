const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  ".electron-build",
  "dist",
  "build",
  "coverage",
  "test-results",
]);

function storageBase(customRoot = null) {
  if (customRoot) return path.resolve(customRoot);
  if (process.env.STORAGE_DIR) {
    return path.join(path.resolve(process.env.STORAGE_DIR), "coding-agent-sandboxes");
  }
  return path.resolve(__dirname, "../../../../storage/coding-agent-sandboxes");
}

function safeRunId(runId) {
  return (
    String(runId || "run")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96) || "run"
  );
}

function realpathIfExists(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function isUnderRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function posixRelative(root, targetPath) {
  return path.relative(root, targetPath).split(path.sep).join("/");
}

function isSecretFile(name) {
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".pem") ||
    name.endsWith(".key")
  );
}

function shouldExclude(entryName) {
  return DEFAULT_EXCLUDED_DIRS.has(entryName) || isSecretFile(entryName);
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

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

function sourceHead(sourceRepoPath) {
  try {
    return execFileSync("git", ["-C", sourceRepoPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function assertAuthorizedSource(sourceRepoPath, allowedSourceRoots = []) {
  const realSource = realpathIfExists(sourceRepoPath);
  if (!realSource) throw new Error(`Source repo does not exist: ${sourceRepoPath}`);
  const allowed = allowedSourceRoots.map((root) => realpathIfExists(path.resolve(root))).filter(Boolean);
  if (!allowed.length) throw new Error("No authorized source roots configured");
  if (!allowed.some((root) => isUnderRoot(realSource, root))) {
    throw new Error(`Source repo is not authorized: ${sourceRepoPath}`);
  }
  return realSource;
}

async function availableBytes(targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  if (typeof fs.statfsSync !== "function") return Number.MAX_SAFE_INTEGER;
  const stats = fs.statfsSync(targetDir);
  return Number(stats.bavail) * Number(stats.bsize);
}

async function assertConcurrency(storageRoot, maxConcurrentSandboxes) {
  if (!Number.isFinite(maxConcurrentSandboxes)) return;
  await fsp.mkdir(storageRoot, { recursive: true });
  const entries = await fsp.readdir(storageRoot, { withFileTypes: true });
  const active = entries.filter((entry) => entry.isDirectory()).length;
  if (active >= maxConcurrentSandboxes) {
    throw new Error(`Concurrent sandbox limit reached: ${maxConcurrentSandboxes}`);
  }
}

async function copyTree({ sourceRoot, targetRoot, manifest }) {
  async function walk(currentSource, currentTarget) {
    const entries = await fsp.readdir(currentSource, { withFileTypes: true });
    await fsp.mkdir(currentTarget, { recursive: true });
    for (const entry of entries) {
      if (shouldExclude(entry.name)) continue;
      const sourcePath = path.join(currentSource, entry.name);
      const targetPath = path.join(currentTarget, entry.name);
      const relativePath = posixRelative(sourceRoot, sourcePath);
      if (entry.isDirectory()) {
        await walk(sourcePath, targetPath);
        continue;
      }
      if (!entry.isFile()) continue;
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.copyFile(sourcePath, targetPath);
      manifest.files[relativePath] = sha256File(sourcePath);
    }
  }
  await walk(sourceRoot, targetRoot);
}

async function createSandboxWorkspace({
  sourceRepoPath,
  runId,
  storageRoot = null,
  allowedSourceRoots = [],
  minFreeBytes = 0,
  maxConcurrentSandboxes = Infinity,
} = {}) {
  const realSource = await assertAuthorizedSource(path.resolve(String(sourceRepoPath || "")), allowedSourceRoots);
  const root = storageBase(storageRoot);
  const free = await availableBytes(root);
  if (free < minFreeBytes) {
    throw new Error(`Insufficient free space for coding sandbox: ${free} bytes available`);
  }
  await assertConcurrency(root, maxConcurrentSandboxes);

  const safeId = safeRunId(runId);
  const sandboxPath = path.join(root, safeId);
  const realRoot = path.resolve(root);
  if (!isUnderRoot(path.resolve(sandboxPath), realRoot)) {
    throw new Error("Sandbox path escaped storage root");
  }
  await fsp.rm(sandboxPath, { recursive: true, force: true });
  await fsp.mkdir(sandboxPath, { recursive: true });

  const manifest = {
    sourceRepoPath: realSource,
    sandboxPath,
    runId: safeId,
    sourceHead: sourceHead(realSource),
    files: {},
  };
  await copyTree({ sourceRoot: realSource, targetRoot: sandboxPath, manifest });

  return {
    runId: safeId,
    sourceRepoPath: realSource,
    sandboxPath,
    storageRoot: realRoot,
    manifest,
    async initBaseline({ env = process.env } = {}) {
      if (env.HOME) await fsp.mkdir(env.HOME, { recursive: true });
      if (env.XDG_CONFIG_HOME) await fsp.mkdir(env.XDG_CONFIG_HOME, { recursive: true });
      await execFileP("git", ["-C", sandboxPath, "init"], { env });
      await execFileP("git", ["-C", sandboxPath, "add", "-A"], { env });
      await execFileP(
        "git",
        [
          "-C",
          sandboxPath,
          "-c",
          "user.name=octopus-coding-agent",
          "-c",
          "user.email=coding-agent@octopus.local",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "-m",
          "baseline",
        ],
        { env }
      );
      return true;
    },
    async cleanup() {
      await fsp.rm(sandboxPath, { recursive: true, force: true });
    },
  };
}

module.exports = {
  createSandboxWorkspace,
  _test: {
    safeRunId,
    shouldExclude,
  },
};
