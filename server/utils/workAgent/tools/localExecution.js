const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const {
  buildShellEnv,
  redactSecrets,
  relativeToRoot,
  resolveAllowedPath,
} = require("../security/policy");

const IGNORED_DIRS = new Set([".git", "node_modules"]);

class ExecutionApprovalRequiredError extends Error {
  constructor(approval) {
    super("Shell command requires approval");
    this.name = "ExecutionApprovalRequiredError";
    this.approval = approval;
  }
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ""), "utf8");
}

function appendCapped(current, chunk, maxBytes) {
  const next = `${current}${chunk}`;
  if (byteLength(next) <= maxBytes) return { text: next, truncated: false };
  return {
    text: Buffer.from(next, "utf8").subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  };
}

function defaultKillProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function splitLines(text) {
  if (text == null) return [];
  if (text === "") return [];
  const lines = String(text).split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function diffLineParts(beforeText, afterText) {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);
  const dp = Array.from({ length: before.length + 1 }, () =>
    Array(after.length + 1).fill(0)
  );

  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      dp[i][j] =
        before[i] === after[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      parts.push(` ${before[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push(`-${before[i]}`);
      i++;
    } else {
      parts.push(`+${after[j]}`);
      j++;
    }
  }
  while (i < before.length) parts.push(`-${before[i++]}`);
  while (j < after.length) parts.push(`+${after[j++]}`);
  return parts;
}

function unifiedDiff({ relativePath, before, after }) {
  if (before === after) return "";
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `--- ${before == null ? "/dev/null" : `a/${relativePath}`}`,
    `+++ ${after == null ? "/dev/null" : `b/${relativePath}`}`,
    "@@",
    ...diffLineParts(before || "", after || ""),
  ].join("\n");
}

class LocalExecutionRuntime {
  constructor({
    policy,
    audit = async () => {},
    spawnFn = spawn,
    killProcessGroup = defaultKillProcessGroup,
    signal = null,
  } = {}) {
    if (!policy) throw new Error("LocalExecutionRuntime requires a policy");
    this.policy = policy;
    this.audit = audit;
    this.spawn = spawnFn;
    this.killProcessGroup = killProcessGroup;
    this.signal = signal;
    this.fileBaselines = new Map();
    this.workspaceBaselineCaptured = false;
  }

  async readFile(targetPath) {
    const absolutePath = resolveAllowedPath(this.policy, targetPath);
    await this.audit("tool.call", {
      toolName: "read_file",
      path: relativeToRoot(this.policy, absolutePath),
    });
    const stat = await fsp.stat(absolutePath);
    if (stat.size > this.policy.maxReadBytes) {
      throw new Error(`File exceeds read limit: ${stat.size} bytes`);
    }
    const content = await fsp.readFile(absolutePath, "utf8");
    await this.audit("tool.result", {
      toolName: "read_file",
      path: relativeToRoot(this.policy, absolutePath),
      sizeBytes: byteLength(content),
    });
    return content;
  }

  async writeFile(targetPath, content, { overwrite = true } = {}) {
    if (byteLength(content) > this.policy.maxWriteBytes) {
      throw new Error(`Content exceeds write limit: ${byteLength(content)} bytes`);
    }
    const absolutePath = resolveAllowedPath(this.policy, targetPath);
    await this._captureBaseline(absolutePath);
    await this.audit("tool.call", {
      toolName: "write_file",
      path: relativeToRoot(this.policy, absolutePath),
      sizeBytes: byteLength(content),
    });
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, content, {
      encoding: "utf8",
      flag: overwrite ? "w" : "wx",
    });
    await this.audit("tool.result", {
      toolName: "write_file",
      path: relativeToRoot(this.policy, absolutePath),
      sizeBytes: byteLength(content),
    });
    return { path: relativeToRoot(this.policy, absolutePath), sizeBytes: byteLength(content) };
  }

  async editFile(targetPath, findText, replaceText) {
    const content = await this.readFile(targetPath);
    if (!content.includes(findText)) {
      throw new Error(`Text to edit was not found in ${targetPath}`);
    }
    return this.writeFile(targetPath, content.replace(findText, replaceText));
  }

  async grep(pattern, { maxResults = 100 } = {}) {
    const matcher = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
    const results = [];

    const walk = async (dir) => {
      if (results.length >= maxResults) return;
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (IGNORED_DIRS.has(entry.name)) continue;
        const absolutePath = path.join(dir, entry.name);
        resolveAllowedPath(this.policy, absolutePath);
        if (entry.isDirectory()) {
          await walk(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fsp.stat(absolutePath);
        if (stat.size > this.policy.maxReadBytes) continue;
        const lines = (await fsp.readFile(absolutePath, "utf8")).split(/\r?\n/);
        lines.forEach((text, index) => {
          if (results.length < maxResults && matcher.test(text)) {
            results.push({
              path: relativeToRoot(this.policy, absolutePath),
              line: index + 1,
              text,
            });
          }
        });
      }
    };

    await this.audit("tool.call", { toolName: "grep", pattern: String(pattern) });
    await walk(this.policy.cwd);
    await this.audit("tool.result", {
      toolName: "grep",
      pattern: String(pattern),
      count: results.length,
    });
    return results;
  }

  async createPatch() {
    await this.audit("tool.call", { toolName: "create_patch" });
    const currentFiles = new Set(await this._walkWorkspaceFiles());
    const candidateFiles = new Set(this.fileBaselines.keys());
    if (this.workspaceBaselineCaptured) {
      for (const file of currentFiles) {
        if (!this.fileBaselines.has(file)) candidateFiles.add(file);
      }
    }

    const diffs = [];
    for (const file of Array.from(candidateFiles).sort()) {
      const before = this.fileBaselines.has(file)
        ? this.fileBaselines.get(file)
        : null;
      const after = currentFiles.has(file)
        ? await this._readTextFileIfSmall(file)
        : null;
      const diff = unifiedDiff({
        relativePath: relativeToRoot(this.policy, file),
        before,
        after,
      });
      if (diff) diffs.push(diff);
    }

    const text = diffs.join("\n");
    await this.audit("tool.result", {
      toolName: "create_patch",
      sizeBytes: byteLength(text),
      format: "unified_diff",
      changedFiles: diffs.length,
    });
    return {
      text,
      sizeBytes: byteLength(text),
      format: "unified_diff",
      changedFiles: diffs.length,
    };
  }

  async captureWorkspaceBaseline() {
    await this._captureWorkspaceBaseline();
  }

  async runShell(command, { approved = false } = {}) {
    if (this.policy.shellApprovalRequired && !approved) {
      throw new ExecutionApprovalRequiredError({
        command,
        cwd: relativeToRoot(this.policy, this.policy.cwd),
        riskLevel: "high",
        reason: "Shell execution is disabled until explicitly approved.",
      });
    }

    await this.audit("tool.call", {
      toolName: "run_shell",
      command: redactSecrets(command),
      cwd: relativeToRoot(this.policy, this.policy.cwd),
      approved,
    });

    await this._captureWorkspaceBaseline();

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let timeoutTimer = null;
      let killTimer = null;
      let child = null;
      const effectiveSignal = this.signal;

      const finish = async ({
        code = null,
        signal = null,
        spawnError = null,
      } = {}) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        effectiveSignal?.removeEventListener?.("abort", abortHandler);
        const result = {
          exitCode: timedOut || aborted || spawnError ? null : code,
          signal,
          timedOut,
          aborted,
          stdout,
          stderr,
          truncated,
          ...(spawnError ? { spawnError: spawnError.message || String(spawnError) } : {}),
        };
        await this.audit("tool.result", {
          toolName: "run_shell",
          exitCode: result.exitCode,
          signal,
          timedOut,
          aborted,
          truncated,
          stdout,
          stderr,
          ...(spawnError ? { spawnError: result.spawnError } : {}),
        });
        resolve(result);
      };

      const sendSignal = (signalName) => {
        if (!child?.pid || settled) return;
        const sent = this.killProcessGroup(child.pid, signalName);
        if (sent === false && typeof child.kill === "function") {
          child.kill(signalName);
        }
      };

      const terminate = (reason) => {
        if (settled) return;
        if (reason === "timeout") timedOut = true;
        if (reason === "abort") aborted = true;
        sendSignal("SIGTERM");
        if (!killTimer) {
          killTimer = setTimeout(() => {
            sendSignal("SIGKILL");
          }, this.policy.shellKillGraceMs);
        }
      };

      const abortHandler = () => terminate("abort");

      try {
        child = this.spawn("/bin/sh", ["-lc", command], {
          cwd: this.policy.cwd,
          env: buildShellEnv(process.env, this.policy.envAllowlist),
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        stderr = redactSecrets(error?.message || String(error));
        finish({ spawnError: error });
        return;
      }
      if (!child || typeof child.on !== "function") {
        const error = new Error("spawn did not return a child process");
        stderr = error.message;
        finish({ spawnError: error });
        return;
      }

      timeoutTimer = setTimeout(() => {
        terminate("timeout");
      }, this.policy.shellTimeoutMs);

      effectiveSignal?.addEventListener?.("abort", abortHandler, { once: true });
      if (effectiveSignal?.aborted) terminate("abort");

      child.stdout?.on("data", (chunk) => {
        const next = appendCapped(
          stdout,
          redactSecrets(chunk.toString()),
          this.policy.maxOutputBytes
        );
        stdout = next.text;
        truncated = truncated || next.truncated;
      });
      child.stderr?.on("data", (chunk) => {
        const next = appendCapped(
          stderr,
          redactSecrets(chunk.toString()),
          this.policy.maxOutputBytes
        );
        stderr = next.text;
        truncated = truncated || next.truncated;
      });

      child.on("error", (error) => {
        const message = redactSecrets(error?.message || String(error));
        stderr = stderr ? `${stderr}\n${message}` : message;
        finish({ spawnError: error });
      });
      child.on("close", (code, signal) => {
        finish({ code, signal });
      });
    });
  }

  async _captureBaseline(absolutePath) {
    if (this.fileBaselines.has(absolutePath)) return;
    this.fileBaselines.set(absolutePath, await this._readTextFileIfSmall(absolutePath));
  }

  async _captureWorkspaceBaseline() {
    if (this.workspaceBaselineCaptured) return;
    for (const file of await this._walkWorkspaceFiles()) {
      await this._captureBaseline(file);
    }
    this.workspaceBaselineCaptured = true;
  }

  async _walkWorkspaceFiles() {
    const files = [];
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const absolutePath = path.join(dir, entry.name);
        resolveAllowedPath(this.policy, absolutePath);
        if (entry.isDirectory()) {
          await walk(absolutePath);
        } else if (entry.isFile()) {
          files.push(absolutePath);
        }
      }
    };
    await walk(this.policy.cwd);
    return files;
  }

  async _readTextFileIfSmall(absolutePath) {
    try {
      const stat = await fsp.stat(absolutePath);
      if (!stat.isFile() || stat.size > this.policy.maxReadBytes) return null;
      return await fsp.readFile(absolutePath, "utf8");
    } catch {
      return null;
    }
  }
}

module.exports = {
  LocalExecutionRuntime,
  ExecutionApprovalRequiredError,
};
