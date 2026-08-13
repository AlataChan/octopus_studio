const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const PermissionBridge = require("../runtime/permissionBridge");
const ToolDescriptor = require("../runtime/toolDescriptor");
const { RiskLevel } = require("../../permissions/constants");
const {
  redactSecrets,
  relativeToRoot,
  resolveAllowedPath,
} = require("../../workAgent/security/policy");
const { generatePatchArtifact } = require("./patchArtifact");

const DEFAULT_OUTPUT_CAP_BYTES = 64 * 1024;
const APPROVAL_REQUIRED = "require_confirmation";
const DEFAULT_EXTERNAL_COMMAND_PATTERNS = Object.freeze([
  /\b(?:npm|pnpm)\s+(?:i|install|add)\b/i,
  /\byarn\s+(?:install|add)\b/i,
  /\b(?:curl|wget)\b/i,
  /\bgit\s+(?:clone|fetch|pull|push)\b/i,
]);

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

function byteLength(text) {
  return Buffer.byteLength(String(text || ""), "utf8");
}

function capOutput(text, maxBytes = DEFAULT_OUTPUT_CAP_BYTES) {
  if (byteLength(text) <= maxBytes) return text;
  const suffix = "\n...[truncated]";
  const keepBytes = Math.max(0, maxBytes - byteLength(suffix));
  return `${Buffer.from(text, "utf8").subarray(0, keepBytes).toString("utf8")}${suffix}`;
}

function redactContent(content) {
  if (content == null) return content;
  if (typeof content === "string") return redactSecrets(content);
  if (Array.isArray(content)) return content.map((item) => redactContent(item));
  if (typeof content === "object") {
    return Object.fromEntries(
      Object.entries(content).map(([key, value]) => [key, redactContent(value)])
    );
  }
  return content;
}

function stringifyContent(content) {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function result({
  id,
  content,
  isError = false,
  reason = undefined,
  outputCapBytes = DEFAULT_OUTPUT_CAP_BYTES,
}) {
  return {
    type: "tool_result",
    tool_use_id: id,
    content: capOutput(stringifyContent(redactContent(content)), outputCapBytes),
    is_error: isError,
    ...(reason ? { reason } : {}),
  };
}

function normalizeDescriptor(tool) {
  if (tool instanceof ToolDescriptor) return tool;
  return new ToolDescriptor({
    name: tool.name,
    description: tool.description || "",
    parameters: tool.parameters || { type: "object", properties: {} },
    handler: tool.handler,
    riskLevel: tool.riskLevel || RiskLevel.SAFE_READ,
    isReadOnly: tool.isReadOnly || tool.riskLevel === RiskLevel.SAFE_READ,
    isDestructive: tool.isDestructive || [RiskLevel.WRITE, RiskLevel.EXECUTE, RiskLevel.EXTERNAL].includes(tool.riskLevel),
  });
}

function validateInput(schema = {}, input = {}) {
  if (!schema.required) return null;
  for (const key of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, key)) {
      return `Missing required property: ${key}`;
    }
  }
  for (const [key, def] of Object.entries(schema.properties || {})) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, key)) continue;
    if (!def?.type) continue;
    if (def.type === "string" && typeof input[key] !== "string") return `Property ${key} must be string`;
    if (def.type === "number" && typeof input[key] !== "number") return `Property ${key} must be number`;
    if (def.type === "boolean" && typeof input[key] !== "boolean") return `Property ${key} must be boolean`;
  }
  return null;
}

function isTestLikeCommand(command) {
  const text = String(command || "").trim();
  return (
    /\b(npm|pnpm|yarn)\s+(run\s+)?(test|check|lint|build)\b/i.test(text) ||
    /\b(jest|vitest|mocha|playwright)\b/i.test(text) ||
    /node\s+\.\/scripts\/jest-compat\.js\b/i.test(text)
  );
}

function isExternalShellCommand(command, patterns = DEFAULT_EXTERNAL_COMMAND_PATTERNS) {
  const text = String(command || "").trim();
  return patterns.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(text) : new RegExp(pattern, "i").test(text)
  );
}

function classifyShellRisk(command, patterns = DEFAULT_EXTERNAL_COMMAND_PATTERNS) {
  return isExternalShellCommand(command, patterns)
    ? RiskLevel.EXTERNAL
    : RiskLevel.EXECUTE;
}

function validateSandboxShellCommand(command) {
  const text = String(command || "");
  if (!text.trim()) throw new Error("Shell command is required");
  if (text.includes("\0")) throw new Error("Shell command contains NUL bytes");
  if (/(^|[\s;&|])cd\s+/i.test(text)) {
    throw new Error("cd is not allowed; commands already run from the sandbox root");
  }
  if (/\.\.(?:\/|\\|$)/.test(text)) {
    throw new Error("parent-directory traversal is not allowed");
  }
  if (/(^|[\s;&|(<>=])\/[^\s;&|]+/.test(text)) {
    throw new Error("absolute filesystem paths are not allowed");
  }
  if (/(^|[\s;&|(<>=])~(?:\/|\b)/.test(text)) {
    throw new Error("home-directory paths are not allowed");
  }
}

async function applyPatchInSandbox({ runtime, patch }) {
  if (!runtime?.policy?.cwd) throw new Error("code_apply_patch requires runtime cwd");
  if (!patch || typeof patch !== "string") throw new Error("patch is required");
  const patchFile = path.join(
    runtime.policy.cwd,
    `.octopus-coding-apply-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.diff`
  );
  await fs.writeFile(patchFile, patch, "utf8");
  try {
    await execFileP("git", ["-C", runtime.policy.cwd, "apply", "--check", patchFile]);
    await execFileP("git", ["-C", runtime.policy.cwd, "apply", "--3way", patchFile]);
    return { applied: true, mode: "git-apply-3way" };
  } finally {
    await fs.rm(patchFile, { force: true });
  }
}

async function listFiles(runtime, startPath = ".") {
  const root = resolveAllowedPath(runtime.policy, startPath || ".");
  const out = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolutePath = path.join(dir, entry.name);
      resolveAllowedPath(runtime.policy, absolutePath);
      const relativePath = relativeToRoot(runtime.policy, absolutePath);
      if (entry.isDirectory()) {
        out.push({ path: relativePath, type: "directory" });
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolutePath);
      out.push({ path: relativePath, type: "file", sizeBytes: stat.size });
    }
  }

  const stat = await fs.stat(root);
  if (stat.isDirectory()) await walk(root);
  if (stat.isFile()) {
    out.push({
      path: relativeToRoot(runtime.policy, root),
      type: "file",
      sizeBytes: stat.size,
    });
  }
  return out.sort((left, right) => left.path.localeCompare(right.path));
}

function makeTool({
  name,
  description,
  parameters,
  riskLevel,
  handler,
  isReadOnly = riskLevel === RiskLevel.SAFE_READ,
}) {
  return new ToolDescriptor({
    name,
    description,
    parameters,
    handler,
    riskLevel,
    isReadOnly,
    isDestructive: !isReadOnly,
    source: "builtin",
  });
}

function defaultTools({
  runtime,
  workspace,
  commandHistory,
  dependencyMode,
  externalCommandPatterns,
}) {
  if (!runtime) throw new Error("CodingToolRuntime default tools require runtime");
  const pathParam = {
    type: "string",
    description: "Path relative to the sandbox root.",
  };

  return [
    makeTool({
      name: "code_read",
      description: "Read a UTF-8 file in the sandbox.",
      riskLevel: RiskLevel.SAFE_READ,
      parameters: {
        type: "object",
        properties: { path: pathParam },
        required: ["path"],
        additionalProperties: false,
      },
      handler: async ({ path: targetPath }) => ({
        path: targetPath,
        content: await runtime.readFile(targetPath),
      }),
    }),
    makeTool({
      name: "code_grep",
      description: "Search text in sandbox files.",
      riskLevel: RiskLevel.SAFE_READ,
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
      handler: async ({ pattern, maxResults = 100 }) => ({
        results: await runtime.grep(pattern, { maxResults }),
      }),
    }),
    makeTool({
      name: "code_write",
      description: "Write or create a UTF-8 file in the sandbox.",
      riskLevel: RiskLevel.WRITE,
      isReadOnly: false,
      parameters: {
        type: "object",
        properties: {
          path: pathParam,
          content: { type: "string" },
          overwrite: { type: "boolean" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      handler: async ({ path: targetPath, content = "", overwrite = true }) => ({
        result: await runtime.writeFile(targetPath, content, { overwrite }),
      }),
    }),
    makeTool({
      name: "code_edit",
      description: "Replace exact text in one sandbox file.",
      riskLevel: RiskLevel.WRITE,
      isReadOnly: false,
      parameters: {
        type: "object",
        properties: {
          path: pathParam,
          findText: { type: "string" },
          replaceText: { type: "string" },
        },
        required: ["path", "findText", "replaceText"],
        additionalProperties: false,
      },
      handler: async ({ path: targetPath, findText, replaceText }) => ({
        result: await runtime.editFile(targetPath, findText, replaceText),
      }),
    }),
    makeTool({
      name: "code_shell",
      description: "Run a shell command from the sandbox root.",
      riskLevel: RiskLevel.EXECUTE,
      isReadOnly: false,
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
        additionalProperties: false,
      },
      handler: async ({ command }) => {
        validateSandboxShellCommand(command);
        if (
          dependencyMode === "no-install" &&
          (isTestLikeCommand(command) || isExternalShellCommand(command, externalCommandPatterns))
        ) {
          const notRun = {
            command,
            status: "not_run",
            reason: "dependency_mode_no_install",
          };
          commandHistory.push(notRun);
          return notRun;
        }
        const shellResult = await runtime.runShell(command, { approved: true });
        const record = {
          command,
          status: shellResult.exitCode === 0 ? "passed" : "failed",
          exitCode: shellResult.exitCode,
          timedOut: shellResult.timedOut,
          aborted: shellResult.aborted,
        };
        commandHistory.push(record);
        return { command, status: record.status, result: shellResult };
      },
    }),
    makeTool({
      name: "code_patch",
      description: "Return a unified diff for sandbox changes.",
      riskLevel: RiskLevel.SAFE_READ,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({
        patch: await generatePatchArtifact({ workspace, runtime }),
      }),
    }),
    makeTool({
      name: "code_apply_patch",
      description: "Apply a unified diff inside the sandbox with git apply.",
      riskLevel: RiskLevel.WRITE,
      isReadOnly: false,
      parameters: {
        type: "object",
        properties: { patch: { type: "string" } },
        required: ["patch"],
        additionalProperties: false,
      },
      handler: async ({ patch }) => applyPatchInSandbox({ runtime, patch }),
    }),
    makeTool({
      name: "code_list",
      description: "List files with size and type metadata.",
      riskLevel: RiskLevel.SAFE_READ,
      parameters: {
        type: "object",
        properties: { path: pathParam },
        additionalProperties: false,
      },
      handler: async ({ path: targetPath = "." }) => ({
        files: await listFiles(runtime, targetPath),
      }),
    }),
    makeTool({
      name: "code_status",
      description: "Show changed files and command/test history.",
      riskLevel: RiskLevel.SAFE_READ,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({
        commandHistory: [...commandHistory],
        patch: await generatePatchArtifact({ workspace, runtime }),
      }),
    }),
  ];
}

class CodingToolRuntime {
  constructor({
    tools = [],
    permissionBridge = null,
    outputCapBytes = DEFAULT_OUTPUT_CAP_BYTES,
    commandHistory = [],
    eventSink = null,
    externalCommandPatterns = DEFAULT_EXTERNAL_COMMAND_PATTERNS,
  } = {}) {
    this.tools = new Map();
    for (const tool of tools) {
      const descriptor = normalizeDescriptor(tool);
      this.tools.set(descriptor.name, descriptor);
    }
    this.permissionBridge = permissionBridge || new PermissionBridge();
    this.outputCapBytes = outputCapBytes;
    this.commandHistory = commandHistory;
    this.eventSink = eventSink;
    this.externalCommandPatterns = externalCommandPatterns;
    this.pendingApprovals = new Map();
  }

  static createDefault({
    runtime,
    workspace,
    permissionBridge = null,
    outputCapBytes = DEFAULT_OUTPUT_CAP_BYTES,
    dependencyMode = "no-install",
    eventSink = null,
    externalCommandPatterns = DEFAULT_EXTERNAL_COMMAND_PATTERNS,
  } = {}) {
    const commandHistory = [];
    return new CodingToolRuntime({
      tools: defaultTools({
        runtime,
        workspace,
        commandHistory,
        dependencyMode,
        externalCommandPatterns,
      }),
      permissionBridge,
      outputCapBytes,
      commandHistory,
      eventSink,
      externalCommandPatterns,
    });
  }

  getToolDescriptors() {
    return Array.from(this.tools.values());
  }

  getCommandHistory() {
    return [...this.commandHistory];
  }

  toolForPermission(tool, input) {
    if (tool.name !== "code_shell") return tool;
    return new ToolDescriptor({
      ...tool,
      riskLevel: classifyShellRisk(input.command, this.externalCommandPatterns),
    });
  }

  approvalRequiredResult({ id, tool, input, permission }) {
    const approvalId = `approval-${crypto.randomBytes(8).toString("hex")}`;
    const payload = {
      status: "approval_required",
      approvalId,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      reason: permission.reason || "Approval required",
      ...(tool.name === "code_shell" ? { command: input.command } : {}),
    };
    this.pendingApprovals.set(approvalId, { id, toolName: tool.name, input });
    this.eventSink?.record?.("coding.tool.approval_required", payload);
    return result({
      id,
      content: payload,
      isError: true,
      reason: "approval_required",
      outputCapBytes: this.outputCapBytes,
    });
  }

  async resumeApprovedToolUse(approvalId, approval = {}) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return result({
        id: approvalId,
        content: `Unknown approval id: ${approvalId}`,
        isError: true,
        reason: "approval_not_found",
        outputCapBytes: this.outputCapBytes,
      });
    }
    if (!approval.approved) {
      this.pendingApprovals.delete(approvalId);
      return result({
        id: pending.id,
        content: { status: "approval_denied", approvalId },
        isError: true,
        reason: "approval_denied",
        outputCapBytes: this.outputCapBytes,
      });
    }

    this.pendingApprovals.delete(approvalId);
    const tool = this.tools.get(pending.toolName);
    try {
      const output = await tool.handler(pending.input, { approved: true, approval });
      return result({
        id: pending.id,
        content: output,
        isError: false,
        outputCapBytes: this.outputCapBytes,
      });
    } catch (error) {
      return result({
        id: pending.id,
        content: redactSecrets(error?.message || String(error)),
        isError: true,
        outputCapBytes: this.outputCapBytes,
      });
    }
  }

  async executeToolUse(toolUse) {
    const id = toolUse?.id;
    const name = toolUse?.name;
    const input = toolUse?.input || {};
    const tool = this.tools.get(name);
    if (!tool) {
      return result({
        id,
        content: `Unknown tool: ${name}`,
        isError: true,
        outputCapBytes: this.outputCapBytes,
      });
    }

    const validationError = validateInput(tool.parameters, input);
    if (validationError) {
      return result({
        id,
        content: validationError,
        isError: true,
        outputCapBytes: this.outputCapBytes,
      });
    }

    const permissionTool = this.toolForPermission(tool, input);
    const permission = this.permissionBridge.evaluate(permissionTool, input);
    if (permission.decision === APPROVAL_REQUIRED) {
      return this.approvalRequiredResult({
        id,
        tool: permissionTool,
        input,
        permission,
      });
    }
    if (permission.decision !== "allow") {
      return result({
        id,
        content: permission.reason || `Tool not allowed: ${name}`,
        isError: true,
        reason: permission.code || "permission_denied",
        outputCapBytes: this.outputCapBytes,
      });
    }

    try {
      const output = await tool.handler(input);
      return result({
        id,
        content: output,
        isError: false,
        outputCapBytes: this.outputCapBytes,
      });
    } catch (error) {
      return result({
        id,
        content: redactSecrets(error?.message || String(error)),
        isError: true,
        outputCapBytes: this.outputCapBytes,
      });
    }
  }
}

module.exports = {
  CodingToolRuntime,
  _test: {
    applyPatchInSandbox,
    capOutput,
    classifyShellRisk,
    isExternalShellCommand,
    isTestLikeCommand,
    validateInput,
  },
};
