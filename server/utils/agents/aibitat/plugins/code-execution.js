const fs = require("fs/promises");
const path = require("path");
const {
  LocalExecutionRuntime,
  ExecutionApprovalRequiredError,
} = require("../../../workAgent/tools/localExecution");
const {
  createExecutionPolicy,
  redactSecrets,
} = require("../../../workAgent/security/policy");
const {
  WORK_AGENT_SETTINGS,
  getWorkAgentSetting,
} = require("../../../workAgent/settings");

const runtimeCache = new WeakMap();

function storageRoot() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  return path.resolve(__dirname, "../../../../storage");
}

function safeWorkspaceSlug(value) {
  return (
    String(value || "default")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "default"
  );
}

function workspaceIdentifier(handlerProps = {}) {
  const workspace =
    handlerProps.workspace || handlerProps.invocation?.workspace || {};
  return (
    workspace.slug ||
    workspace.name ||
    workspace.id ||
    handlerProps.workspaceId ||
    handlerProps.invocation?.workspace_id ||
    "default"
  );
}

async function workspaceConfiguredRoot(handlerProps = {}) {
  const configuredRoot = await getWorkAgentSetting(
    WORK_AGENT_SETTINGS.codeExecutionRoot
  );
  if (configuredRoot) return configuredRoot;

  const workspace =
    handlerProps.workspace || handlerProps.invocation?.workspace || {};
  const slug = safeWorkspaceSlug(
    workspaceIdentifier(handlerProps)
  ).toUpperCase();
  const envSpecific = process.env[`ALATA_CODE_EXECUTION_ROOT_${slug}`];
  if (envSpecific) return envSpecific;

  return (
    workspace.codeExecutionRoot ||
    workspace.workspaceRoot ||
    workspace.settings?.codeExecutionRoot ||
    handlerProps.codeExecutionRoot ||
    process.env.ALATA_CODE_EXECUTION_ROOT ||
    null
  );
}

async function ensureWorkspaceRoot(handlerProps = {}) {
  const configured = await workspaceConfiguredRoot(handlerProps);
  const root = configured
    ? path.resolve(configured)
    : path.join(
        storageRoot(),
        "agent-code-workspaces",
        safeWorkspaceSlug(workspaceIdentifier(handlerProps))
      );
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function getRuntime(aibitat) {
  const handlerProps = aibitat?.handlerProps || {};
  const root = await ensureWorkspaceRoot(handlerProps);
  const cached = runtimeCache.get(aibitat);
  if (cached?.root === root) return cached.runtime;

  const policy = createExecutionPolicy({
    workspaceRoots: [root],
    cwd: root,
    shellApprovalRequired: true,
  });
  const runtime = new LocalExecutionRuntime({
    policy,
    audit: async (type, payload) => {
      handlerProps.log?.(
        `[code-execution] ${type}: ${JSON.stringify({
          ...payload,
          command: payload?.command
            ? redactSecrets(payload.command)
            : undefined,
        })}`
      );
    },
  });
  runtimeCache.set(aibitat, { root, runtime });
  return runtime;
}

function jsonResult(payload) {
  return JSON.stringify(payload, null, 2);
}

async function runTool(handler, args, context) {
  try {
    return jsonResult({ success: true, ...(await handler(args, context)) });
  } catch (error) {
    if (error instanceof ExecutionApprovalRequiredError) {
      return jsonResult({
        success: false,
        approvalRequired: true,
        error: error.message,
        approval: error.approval,
      });
    }
    return jsonResult({
      success: false,
      error: redactSecrets(error?.message || String(error)),
    });
  }
}

function validateSandboxShellCommand(command) {
  const text = String(command || "");
  if (!text.trim()) throw new Error("Shell command is required");
  if (text.includes("\0")) throw new Error("Shell command contains NUL bytes");

  const deniedPatterns = [
    {
      pattern: /(^|[\s;&|])cd\s+/i,
      reason: "cd is not allowed; commands already run from the sandbox root",
    },
    {
      pattern: /\.\.(?:\/|\\|$)/,
      reason: "parent-directory traversal is not allowed",
    },
    {
      pattern: /(^|[\s;&|(<>=])\/[^\s;&|]+/,
      reason: "absolute filesystem paths are not allowed",
    },
    {
      pattern: /(^|[\s;&|(<>=])~(?:\/|\b)/,
      reason: "home-directory paths are not allowed",
    },
    {
      pattern: /\$(HOME|PWD|OLDPWD)\b/,
      reason: "shell workspace escape variables are not allowed",
    },
  ];

  for (const { pattern, reason } of deniedPatterns) {
    if (pattern.test(text)) throw new Error(reason);
  }
}

function createCodeTool({
  name,
  description,
  parameters,
  isReadOnly = false,
  isDestructive = false,
  handler,
}) {
  return {
    name,
    startupConfig: { params: {} },
    plugin: function () {
      return {
        name: this.name,
        setup(aibitat) {
          aibitat.function({
            super: aibitat,
            name: this.name,
            description,
            parameters,
            isReadOnly,
            isDestructive,
            handler: async function (args = {}) {
              const runtime = await getRuntime(this.super);
              return runTool(handler, args, { runtime, aibitat: this.super });
            },
          });
        },
      };
    },
  };
}

const pathParam = {
  type: "string",
  description:
    "Path relative to the workspace code sandbox. Absolute paths are resolved through the same sandbox policy and cannot escape it.",
};

const codeRead = createCodeTool({
  name: "code_read",
  isReadOnly: true,
  description:
    "Read a UTF-8 text file from the workspace code sandbox. Use before editing code or inspecting project files.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { path: pathParam },
    required: ["path"],
    additionalProperties: false,
  },
  handler: async ({ path: targetPath }, { runtime }) => ({
    path: targetPath,
    content: await runtime.readFile(targetPath),
  }),
});

const codeWrite = createCodeTool({
  name: "code_write",
  isDestructive: true,
  description:
    "Write a UTF-8 text file inside the workspace code sandbox. This can create parent directories but cannot escape the sandbox root.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      path: pathParam,
      content: { type: "string", description: "New file content." },
      overwrite: {
        type: "boolean",
        description: "Whether to overwrite an existing file.",
        default: true,
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  handler: async (
    { path: targetPath, content = "", overwrite = true },
    { runtime }
  ) => ({
    result: await runtime.writeFile(targetPath, content, { overwrite }),
  }),
});

const codeEdit = createCodeTool({
  name: "code_edit",
  isDestructive: true,
  description:
    "Replace the first matching text fragment in a file inside the workspace code sandbox.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      path: pathParam,
      findText: { type: "string", description: "Exact text to replace." },
      replaceText: { type: "string", description: "Replacement text." },
    },
    required: ["path", "findText", "replaceText"],
    additionalProperties: false,
  },
  handler: async (
    { path: targetPath, findText, replaceText },
    { runtime }
  ) => ({
    result: await runtime.editFile(targetPath, findText, replaceText),
  }),
});

const codeGrep = createCodeTool({
  name: "code_grep",
  isReadOnly: true,
  description:
    "Search text files in the workspace code sandbox using a JavaScript regular expression pattern.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript RegExp pattern." },
      maxResults: {
        type: "number",
        description: "Maximum number of matches to return.",
        default: 100,
      },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  handler: async ({ pattern, maxResults = 100 }, { runtime }) => ({
    results: await runtime.grep(pattern, { maxResults }),
  }),
});

const codePatch = createCodeTool({
  name: "code_patch",
  isReadOnly: true,
  description:
    "Return a unified diff for files changed through code_write, code_edit, or approved code_shell during this agent run.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_args, { runtime }) => ({
    patch: await runtime.createPatch(),
  }),
});

const codeShell = createCodeTool({
  name: "code_shell",
  isDestructive: true,
  description:
    "Run a shell command in the workspace code sandbox. AIbitat permission gating must approve this execute-risk tool before it reaches the sandbox runtime.",
  parameters: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to run from the sandbox root.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  handler: async ({ command }, { runtime }) => {
    validateSandboxShellCommand(command);
    return {
      result: await runtime.runShell(command, { approved: true }),
    };
  },
});

module.exports = {
  codeRead,
  codeWrite,
  codeEdit,
  codeGrep,
  codePatch,
  codeShell,
  _test: {
    ensureWorkspaceRoot,
    getRuntime,
    safeWorkspaceSlug,
    validateSandboxShellCommand,
  },
};
