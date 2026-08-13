const { execSync, execFileSync } = require("child_process");
const path = require("path");
const os = require("os");

const MIN_NODE_MAJOR = 22;

function getShellEnv() {
  try {
    const shell = process.env.SHELL || "/bin/sh";
    const envOutput = execSync(`${shell} -l -c 'env'`, {
      encoding: "utf8",
      timeout: 5000,
    });
    const env = {};
    for (const line of envOutput.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return { ...process.env, ...env };
  } catch {
    return process.env;
  }
}

function findExecutable(name, shellEnv = process.env) {
  try {
    const which = os.platform() === "win32" ? "where" : "which";
    const result = execFileSync(which, [name], {
      env: shellEnv,
      encoding: "utf8",
      timeout: 3000,
    });
    return result.trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

function checkNodeVersion() {
  const shellEnv = getShellEnv();
  const nodePath = findExecutable("node", shellEnv);
  if (!nodePath) return { status: "not_found" };

  try {
    const raw = execFileSync(nodePath, ["--version"], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    const match = raw.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { status: "not_found" };

    const [, major, minor, patch] = match.map(Number);
    const version = `${major}.${minor}.${patch}`;

    if (major < MIN_NODE_MAJOR) {
      return { status: "version_low", version, path: nodePath };
    }
    return { status: "ok", version, path: nodePath };
  } catch {
    return { status: "not_found" };
  }
}

function checkGitAvailable() {
  const shellEnv = getShellEnv();
  const gitPath = findExecutable("git", shellEnv);
  if (!gitPath) return { available: false, path: null };
  try {
    execFileSync(gitPath, ["--version"], { timeout: 3000 });
    return { available: true, path: gitPath };
  } catch {
    return { available: false, path: null };
  }
}

function getNodeDownloadUrl() {
  const version = "22.13.1";
  const platform = os.platform();
  if (platform === "win32")
    return `https://nodejs.org/dist/v${version}/node-v${version}-x64.msi`;
  if (platform === "darwin")
    return `https://nodejs.org/dist/v${version}/node-v${version}.pkg`;
  return `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz`;
}

function getGitDownloadUrl() {
  if (os.platform() === "win32")
    return "https://github.com/git-for-windows/git/releases/latest/download/Git-2.44.0-64-bit.exe";
  return "https://git-scm.com/downloads";
}

module.exports = {
  getShellEnv,
  findExecutable,
  checkNodeVersion,
  checkGitAvailable,
  getNodeDownloadUrl,
  getGitDownloadUrl,
};
