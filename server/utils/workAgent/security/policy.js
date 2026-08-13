const fs = require("fs");
const path = require("path");

const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "SHELL",
]);

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

function createExecutionPolicy(input = {}) {
  const workspaceRoots = [
    ...toArray(input.workspaceRoot),
    ...toArray(input.workspaceRoots),
    ...toArray(input.allowedWorkspaceRoots),
  ]
    .filter(Boolean)
    .map((root) => path.resolve(String(root)));

  if (!workspaceRoots.length) {
    throw new Error("At least one workspace root is required for work-agent execution");
  }

  const allowedRoots = workspaceRoots.map((root) => {
    const real = realpathIfExists(root);
    if (!real) throw new Error(`Workspace root does not exist: ${root}`);
    return real;
  });

  const cwd = input.cwd ? path.resolve(String(input.cwd)) : allowedRoots[0];
  const realCwd = realpathIfExists(cwd);
  if (!realCwd || !allowedRoots.some((root) => isUnderRoot(realCwd, root))) {
    throw new Error(`cwd is not under an allowed workspace root: ${cwd}`);
  }

  return {
    allowedRoots,
    cwd: realCwd,
    maxReadBytes: input.maxReadBytes || 256 * 1024,
    maxWriteBytes: input.maxWriteBytes || 256 * 1024,
    maxOutputBytes: input.maxOutputBytes || 64 * 1024,
    shellTimeoutMs: input.shellTimeoutMs || 30_000,
    shellKillGraceMs: input.shellKillGraceMs || 5_000,
    shellApprovalRequired: input.shellApprovalRequired !== false,
    envAllowlist: input.envAllowlist || DEFAULT_ENV_ALLOWLIST,
  };
}

function resolveAllowedPath(policy, requestedPath) {
  if (!policy?.allowedRoots?.length) {
    throw new Error("Execution policy has no allowed workspace roots");
  }
  if (!requestedPath || typeof requestedPath !== "string") {
    throw new Error("A target path is required");
  }

  const candidate = path.resolve(policy.cwd, requestedPath);
  let comparablePath = realpathIfExists(candidate);

  if (!comparablePath) {
    const missingParts = [];
    let ancestor = candidate;
    while (!realpathIfExists(ancestor) && ancestor !== path.dirname(ancestor)) {
      missingParts.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
    const ancestorRealPath = realpathIfExists(ancestor);
    if (!ancestorRealPath) {
      throw new Error(`Parent path does not exist: ${path.dirname(candidate)}`);
    }
    comparablePath = path.join(ancestorRealPath, ...missingParts);
  }

  if (!policy.allowedRoots.some((root) => isUnderRoot(comparablePath, root))) {
    throw new Error(`Path is not under an allowed workspace root: ${requestedPath}`);
  }

  return candidate;
}

function relativeToRoot(policy, absolutePath) {
  const root = policy.allowedRoots.find((allowedRoot) =>
    isUnderRoot(path.resolve(absolutePath), allowedRoot)
  );
  if (!root) return absolutePath;
  return path.relative(root, absolutePath) || ".";
}

function buildShellEnv(sourceEnv = process.env, allowlist = DEFAULT_ENV_ALLOWLIST) {
  return allowlist.reduce((env, key) => {
    if (Object.prototype.hasOwnProperty.call(sourceEnv, key)) {
      env[key] = sourceEnv[key];
    }
    return env;
  }, {});
}

function redactSecrets(value) {
  if (value == null) return value;
  return String(value)
    .replace(
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=([^\s"']+)/gi,
      "$1=[REDACTED]"
    )
    .replace(/(Authorization:\s*Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]");
}

module.exports = {
  DEFAULT_ENV_ALLOWLIST,
  createExecutionPolicy,
  resolveAllowedPath,
  relativeToRoot,
  buildShellEnv,
  redactSecrets,
};
