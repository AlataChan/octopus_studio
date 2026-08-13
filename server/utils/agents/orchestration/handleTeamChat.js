"use strict";

/**
 * handleTeamChat.js — Routes @团队/@team chat to TeamOrchestrationService.
 *
 * Returns true  → orchestration handled the request (caller should return).
 * Returns false → no employees found; caller should fall through to normal path.
 *
 * All dependencies are injectable for testing; production defaults are lazy-
 * loaded to avoid circular-require issues at startup.
 */

const { TEAM_HANDLES } = require("./teamTrigger");

/**
 * Strip @团队 / @team handles from a message string.
 */
function stripTeamHandles(msg) {
  let text = String(msg || "");
  for (const h of TEAM_HANDLES) {
    text = text.split(h).join("");
  }
  return text.trim();
}

/**
 * Main entry point — called from stream.js when isTeamTrigger() is true.
 *
 * @param {object} opts
 * @param {object}   opts.response        - Express response (for writeChunk)
 * @param {object}   opts.workspace       - Workspace object { id, ... }
 * @param {string}   opts.message         - Raw message text (pre-grepCommand)
 * @param {object}   opts.user            - Authenticated user object
 * @param {object|null} opts.thread       - Thread object or null
 * @param {string|null} opts.assistantId  - Active assistantId or null
 * @param {string}   opts.uuid            - Request UUID for writeChunk
 *
 * ── Injectable (defaults provided, overridden in tests) ──────────────────────
 * @param {object|null} opts.service         - TeamOrchestrationService instance
 * @param {Function|null} opts.listEmployees - async (workspaceId) => employees[]
 * @param {Function|null} opts.generateText  - Planner LLM boundary
 * @param {Function|null} opts.persistChat   - async ({...}) => void
 * @param {Function|null} opts.writeChunk    - writeResponseChunk-compatible fn
 */
async function handleTeamOrchestration({
  response,
  workspace,
  message,
  user,
  thread,
  assistantId,
  uuid,
  // Injectable dependencies (defaults loaded lazily below)
  service = null,
  listEmployees = null,
  generateText = null,
  persistChat = null,
  writeChunk = null,
}) {
  // ── Resolve defaults lazily (avoid circular require at module load) ─────────
  if (!writeChunk) {
    const { writeResponseChunk } = require("../../helpers/chat/responses");
    writeChunk = writeResponseChunk;
  }
  if (!persistChat) {
    const { WorkspaceChats } = require("../../../models/workspaceChats");
    persistChat = WorkspaceChats.new.bind(WorkspaceChats);
  }
  if (!listEmployees) {
    const { WorkspaceAssistant } = require("../../../models/workspaceAssistant");
    listEmployees = async (workspaceId) => {
      const assistants = await WorkspaceAssistant.forWorkspace(workspaceId);
      return (assistants || []).map((a) => ({
        assistantId: String(a.id),
        name: a.name || "",
        title: a.title || "",
        capabilities: a.capabilities || [],
      }));
    };
  }
  if (!generateText) {
    // Default: use the workspace's configured LLM provider (agentProvider or chatProvider).
    // getLLMProvider resolves the actual provider and getChatCompletion returns { textResponse }.
    // Tests inject their own generateText so this path is not exercised in automated tests.
    const { buildWorkspaceGenerateText } = require("./workspaceGenerateText");
    generateText = buildWorkspaceGenerateText({ workspace });
  }
  if (!service) {
    const {
      TeamOrchestrationService,
    } = require("./teamOrchestrationService");
    service = new TeamOrchestrationService();
  }

  // ── 1. Fetch available employees ────────────────────────────────────────────
  const employees = await listEmployees(workspace.id);
  if (!employees || !employees.length) return false; // No employees → fall through

  // ── 2. Strip @team handles from goal ────────────────────────────────────────
  const goal = stripTeamHandles(message);

  // ── 3. onEvent: forward status/taskList events to the socket ────────────────
  const onEvent = (e) => {
    if (e?.type === "agentTaskList") {
      writeChunk(response, {
        id: uuid,
        type: "agentTaskList",
        content: e.content,
        close: false,
        error: null,
      });
    } else if (e?.type === "fileDownload") {
      writeChunk(response, {
        id: uuid,
        type: "fileDownload",
        content: e.content,
        close: false,
        error: null,
      });
    } else if (e?.type === "statusResponse") {
      writeChunk(response, {
        id: uuid,
        type: "agentThought",
        thought: e.content,
        close: false,
        error: null,
        animate: true,
      });
    }
  };

  // ── 4. Abort on HTTP disconnect ─────────────────────────────────────────────
  const controller = new AbortController();
  response.on?.("close", () => controller.abort());

  // ── 5. Run orchestration ────────────────────────────────────────────────────
  const result = await service.run({
    workspace,
    user,
    thread,
    goal,
    employees,
    generateText,
    signal: controller.signal,
    onEvent,
    config: {},
  });

  // ── 6. Check for suspended status (approval requested) ──────────────────────
  if (result?.status === "suspended") {
    // Approval requested: approvalRequested event already bubbled via onEvent.
    // Do NOT persist final chat or send final textResponse — short-circuit.
    writeChunk(response, {
      id: uuid,
      type: "statusResponse",
      thought: "⏸️ 已请求人工审批，批准后将继续。",
      close: true,
      error: null,
    });
    return true;
  }

  // ── 7. Write final response + persist ONE chat record ───────────────────────
  writeChunk(response, {
    id: uuid,
    type: "textResponse",
    textResponse: result.text,
    sources: result.sources || [],
    close: true,
    error: result.error ? result.error.message : null,
  });

  await persistChat({
    workspaceId: workspace.id,
    prompt: message,
    response: {
      text: result.text,
      sources: result.sources || [],
      type: "chat",
      metadata: {
        team: true,
        runId: result.runId,
        steps: result.steps?.length || 0,
      },
    },
    threadId: thread?.id || null,
    user,
    include: true,
  });

  return true;
}

module.exports = { handleTeamOrchestration, stripTeamHandles };
