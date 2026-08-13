#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const MODEL = "deepseek-v4-pro";
const BASE_URL = "https://api.deepseek.com";

function readEnvValue(filePath, key) {
  const body = fs.readFileSync(filePath, "utf8");
  const match = body.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

const apiKey = readEnvValue(path.join(REPO_ROOT, ".env.bak"), "DEEPSEEK_API_KEY");
if (!apiKey) {
  console.error("Missing DEEPSEEK_API_KEY in .env.bak");
  process.exit(1);
}

process.env.GENERIC_OPEN_AI_BASE_PATH = BASE_URL;
process.env.GENERIC_OPEN_AI_API_KEY = apiKey;
process.env.GENERIC_OPEN_AI_MODEL_PREF = MODEL;
process.env.GENERIC_OPENAI_STREAMING_DISABLED = "true";
process.env.USE_TURN_STATE = "false";

const AIbitat = require("../utils/agents/aibitat");
const { SystemSettings } = require("../models/systemSettings");
SystemSettings.get = async () => null;
SystemSettings._updateSettings = async () => ({ success: true });
const AgentPlugins = require("../utils/agents/aibitat/plugins");
const {
  PermissionMode,
  ToolGatewayDecision,
} = require("../utils/permissions/constants");

async function main() {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "deepseek-aibitat-workspace-")
  );
  process.env.ALATA_CODE_EXECUTION_ROOT = workspaceRoot;

  const toolEvents = [];
  const logs = [];
  const aibitat = new AIbitat({
    provider: "generic-openai",
    model: MODEL,
    maxRounds: 8,
    handlerProps: {
      workspaceId: 1,
      workspace: { id: 1, slug: "deepseek-aibitat-smoke" },
      codeExecutionRoot: workspaceRoot,
      log: (line) => logs.push(String(line)),
    },
    permissionConfig: {
      permissionMode: PermissionMode.ACCEPT_EDITS,
      allowedTools: ["code_read", "code_write", "code_grep", "code_shell"],
      autoApprovedTools: [],
    },
  });

  aibitat.reportToolCall = (event) => toolEvents.push(event);

  for (const tool of [
    AgentPlugins.codeWrite,
    AgentPlugins.codeRead,
    AgentPlugins.codeGrep,
    AgentPlugins.codeShell,
  ]) {
    aibitat.use(tool.plugin());
  }

  aibitat
    .agent("user", {
      interrupt: "ALWAYS",
      role: "Human operator.",
    })
    .agent("coder", {
      role:
        "You are a coding execution agent. Use tools, not prose, to satisfy file tasks. " +
        "For this task you must call code_write to create the requested file, then call code_read to read it back. " +
        "A code_write result only proves the write happened; it does not contain file content. " +
        "Do not claim you read the file unless you have a code_read result containing the content field. " +
        "After the read confirms the exact content, reply TERMINATE.",
      functions: ["code_write", "code_read", "code_grep", "code_shell"],
    });

  const shellDecision = aibitat.evaluateToolPermission("code_shell");
  const writeDecision = aibitat.evaluateToolPermission("code_write");

  const startedAt = Date.now();
  await aibitat.start({
    from: "user",
    to: "coder",
    content:
      "Create a file named deepseek-aibitat.txt with content exactly hello-aibitat, then read it back and confirm.",
  });

  const targetPath = path.join(workspaceRoot, "deepseek-aibitat.txt");
  const fileCreated = fs.existsSync(targetPath);
  const fileContent = fileCreated ? fs.readFileSync(targetPath, "utf8") : null;
  const toolStarts = toolEvents
    .filter((event) => event.stage === "start")
    .map((event) => event.toolName);

  const result = {
    ok:
      fileCreated &&
      fileContent === "hello-aibitat" &&
      toolStarts.includes("code_write") &&
      toolStarts.includes("code_read") &&
      shellDecision.decision === ToolGatewayDecision.REQUIRE_CONFIRMATION,
    provider: "generic-openai",
    model: MODEL,
    base_url: BASE_URL,
    workspace_root: workspaceRoot,
    latency_ms: Date.now() - startedAt,
    code_write_called: toolStarts.includes("code_write"),
    code_read_called: toolStarts.includes("code_read"),
    code_shell_decision: shellDecision.decision,
    code_write_decision: writeDecision.decision,
    file_created: fileCreated,
    file_content: fileContent,
    final_messages: aibitat.chats.slice(-4).map((chat) => ({
      from: chat.from,
      to: chat.to,
      content: String(chat.content || "").slice(0, 240),
      state: chat.state,
    })),
    tool_events: toolEvents.map((event) => ({
      toolName: event.toolName,
      stage: event.stage,
      success: event.stage === "success" ? true : undefined,
    })),
    log_tail: logs.slice(-10),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || String(error),
        stack: error?.stack ? error.stack.split("\n").slice(0, 8) : undefined,
      },
      null,
      2
    )
  );
  process.exit(1);
});
