const fs = require("fs/promises");
const path = require("path");

const ACTIVE_STATUSES = new Set(["running", "awaiting_approval"]);

async function dirSizeBytes(dir) {
  let total = 0;
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.isFile()) {
        const stat = await fs.stat(target);
        total += stat.size;
      }
    }
  }
  await walk(dir);
  return total;
}

function isProtected(run) {
  return run && ACTIVE_STATUSES.has(run.status);
}

function eligibleByAge({ run, ageMs, ttlMs, unappliedTtlMs }) {
  if (isProtected(run)) return false;
  if (run?.status === "completed" && !run.appliedAt) {
    return ageMs >= unappliedTtlMs;
  }
  return ageMs >= ttlMs;
}

async function cleanupSandboxes({
  storageRoot,
  repository,
  now = () => Date.now(),
  ttlMs = 24 * 60 * 60 * 1000,
  unappliedTtlMs = 7 * 24 * 60 * 60 * 1000,
  maxTotalBytes = Infinity,
} = {}) {
  if (!storageRoot) throw new Error("storageRoot is required");
  await fs.mkdir(storageRoot, { recursive: true });
  const entries = await fs.readdir(storageRoot, { withFileTypes: true });
  const candidates = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sandboxPath = path.join(storageRoot, entry.name);
    const stat = await fs.stat(sandboxPath);
    const sizeBytes = await dirSizeBytes(sandboxPath);
    const run = await repository?.getRunForSandbox?.(sandboxPath);
    const candidate = {
      sandboxPath,
      run,
      sizeBytes,
      ageMs: Number(now()) - stat.mtimeMs,
      mtimeMs: stat.mtimeMs,
    };
    totalBytes += sizeBytes;
    candidates.push(candidate);
  }

  const removed = [];
  async function removeCandidate(candidate) {
    await fs.rm(candidate.sandboxPath, { recursive: true, force: true });
    removed.push(candidate.sandboxPath);
    totalBytes -= candidate.sizeBytes;
  }

  for (const candidate of candidates) {
    if (eligibleByAge({ run: candidate.run, ageMs: candidate.ageMs, ttlMs, unappliedTtlMs })) {
      await removeCandidate(candidate);
    }
  }

  if (totalBytes > maxTotalBytes) {
    for (const candidate of candidates
      .filter((entry) => !removed.includes(entry.sandboxPath) && !isProtected(entry.run))
      .sort((left, right) => left.mtimeMs - right.mtimeMs)) {
      if (totalBytes <= maxTotalBytes) break;
      await removeCandidate(candidate);
    }
  }

  return { removed, totalBytes };
}

module.exports = {
  cleanupSandboxes,
  _test: {
    eligibleByAge,
  },
};
