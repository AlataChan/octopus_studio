const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { reqBody } = require("../../../utils/http");
const { validApiKey } = require("../../../utils/middleware/validApiKey");
const { Workspace } = require("../../../models/workspace");
const { WorkspaceAssistant } = require("../../../models/workspaceAssistant");
const { WorkspaceThread } = require("../../../models/workspaceThread");
const { chatSync } = require("../../../utils/chats/apiChatHandler");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../../../utils/agents/ephemeral");
const ResponsesShell = require("../../../utils/agents/runtime/responsesShell");

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function stableHash(input) {
  return crypto
    .createHash("sha1")
    .update(String(input || ""))
    .digest("hex")
    .slice(0, 12);
}

function extractInputText(input) {
  if (typeof input === "string") return input;

  if (Array.isArray(input)) {
    // Chat-completions-like: [{role, content}]
    const lastUser = [...input]
      .reverse()
      .find((item) => item && item.role === "user");

    const content = lastUser?.content ?? input?.[input.length - 1]?.content;
    if (typeof content === "string") return content;

    // Responses-like: content parts
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part) return "";
          if (typeof part === "string") return part;
          if (typeof part.text === "string") return part.text;
          return "";
        })
        .join("\n")
        .trim();
    }

    return JSON.stringify(input);
  }

  if (input && typeof input === "object") {
    if (typeof input.text === "string") return input.text;
  }

  return String(input || "");
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildResponseObject({
  id,
  status,
  model,
  createdAt = nowSeconds(),
  completedAt = null,
  outputText = null,
  messageId = null,
  user = null,
}) {
  const msgId = messageId || `msg_${uuidv4().replace(/-/g, "")}`;
  const output =
    outputText == null
      ? []
      : [
          {
            type: "message",
            id: msgId,
            status: status === "completed" ? "completed" : "in_progress",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: String(outputText || ""),
                annotations: [],
              },
            ],
          },
        ];

  return {
    id,
    object: "response",
    created_at: createdAt,
    status,
    completed_at: completedAt,
    error: null,
    incomplete_details: null,
    model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: true,
    temperature: 1.0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1.0,
    truncation: "disabled",
    usage: null,
    user,
    metadata: {},
  };
}

async function getOrCreateStableThread({ workspace, user, agentId = null }) {
  if (!user) return null;
  const suffix = stableHash(`${workspace.id}:${agentId || "default"}:${user}`);
  const slug = `responses-w${workspace.id}-${suffix}`;

  const existing = await WorkspaceThread.get({ slug });
  if (existing) return existing;

  const { thread } = await WorkspaceThread.new(workspace, null, {
    slug,
    name: `Responses: ${String(user).slice(0, 60)}`,
  });
  return thread || null;
}

async function runAgentInvocation({
  workspace,
  assistantId,
  prompt,
  thread,
  source = null,
}) {
  if (process.env.USE_SESSION_ENGINE === "true") {
    return await runAgentViaSessionEngine({
      workspace,
      assistantId,
      prompt,
      thread,
      source,
    });
  }

  const uuid = `resp_${uuidv4().replace(/-/g, "")}`;
  const agentHandler = new EphemeralAgentHandler({
    uuid,
    workspace,
    prompt,
    userId: null,
    threadId: thread?.id || null,
    sessionId: null,
    assistantId,
    source,
  });

  const listener = new EphemeralEventListener();
  await agentHandler.init();
  await agentHandler.createAIbitat({ handler: listener });
  agentHandler.startAgentCluster();
  return await listener.waitForClose();
}

async function createAgentSessionEngine({
  workspace,
  assistantId,
  prompt,
  thread,
  source = null,
}) {
  const uuid = `resp_${uuidv4().replace(/-/g, "")}`;
  const agentHandler = new EphemeralAgentHandler({
    uuid,
    workspace,
    prompt,
    userId: null,
    threadId: thread?.id || null,
    sessionId: null,
    assistantId,
    source,
  });

  const listener = new EphemeralEventListener();
  await agentHandler.init();
  await agentHandler.createAIbitat({ handler: listener });

  const sessionEngine = agentHandler.createSessionEngine?.();
  if (!sessionEngine) {
    throw new Error("SessionEngine unavailable for agent invocation.");
  }

  return { agentHandler, listener, sessionEngine };
}

async function runAgentViaSessionEngine({
  workspace,
  assistantId,
  prompt,
  thread,
  source = null,
}) {
  const { sessionEngine } = await createAgentSessionEngine({
    workspace,
    assistantId,
    prompt,
    thread,
    source,
  });

  let outputText = "";
  for await (const event of sessionEngine.submitMessage(prompt)) {
    if (event?.type === "result") {
      outputText = String(event.content || "");
    }
  }

  return {
    thoughts: [],
    textResponse: outputText || sessionEngine.getResultContent?.() || "",
  };
}

function apiResponsesEndpoints(app) {
  if (!app) return;

  app.post("/v1/responses", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['OpenAI Compatible Endpoints']
    #swagger.description = 'OpenAI Responses API compatibility (minimal). Supports agent routing via header/model prefix.'
    */
    const startedAt = nowSeconds();
    let sequenceNumber = 1;
    let responseId = `resp_${uuidv4().replace(/-/g, "")}`;

    try {
      const body = reqBody(request);
      const stream = body?.stream === true;
      const rawModel = String(body?.model || "");
      const user = body?.user ? String(body.user) : null;
      const inputText = extractInputText(body?.input);

      const headerAgentIdRaw =
        request.headers["x-alata-agent-id"] ||
        request.headers["X-Alata-Agent-Id"];
      const headerAgentId = headerAgentIdRaw ? String(headerAgentIdRaw) : null;

      const modelAgentId = rawModel.toLowerCase().startsWith("agent:")
        ? rawModel.slice("agent:".length)
        : null;

      if (headerAgentId && modelAgentId && headerAgentId !== modelAgentId) {
        console.warn("[/v1/responses] Agent route conflict; header wins", {
          headerAgentId,
          modelAgentId,
        });
      }

      const agentId = headerAgentId || modelAgentId || null;

      // Resolve routing target
      let workspace = null;
      let assistantId = null;
      let modelForResponse = rawModel;

      if (agentId) {
        assistantId = String(agentId);
        const assistant = await WorkspaceAssistant.getById(assistantId);
        if (!assistant?.workspace?.id) {
          return response.status(404).json({
            error: {
              message: "Agent not found",
              type: "not_found_error",
              code: "agent_not_found",
            },
          });
        }

        workspace = await Workspace.get({ id: Number(assistant.workspace.id) });
        if (!workspace) {
          return response.status(404).json({
            error: {
              message: "Workspace not found for agent",
              type: "not_found_error",
              code: "workspace_not_found",
            },
          });
        }

        modelForResponse = `agent:${assistantId}`;
      } else {
        if (!rawModel) {
          return response.status(400).json({
            error: {
              message: "model is required",
              type: "invalid_request_error",
              code: "model_required",
            },
          });
        }

        workspace = await Workspace.get({ slug: rawModel });
        if (!workspace) {
          return response.status(404).json({
            error: {
              message: "Workspace not found",
              type: "not_found_error",
              code: "workspace_not_found",
            },
          });
        }
      }

      const thread = await getOrCreateStableThread({
        workspace,
        user,
        agentId: assistantId,
      });

      if (stream) {
        response.status(200);
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");

        if (assistantId && process.env.USE_SESSION_ENGINE === "true") {
          const { sessionEngine } = await createAgentSessionEngine({
            workspace,
            assistantId,
            prompt: inputText,
            thread,
            source: {
              kind: "responses_api",
              user,
              assistantId,
            },
          });
          const shell = new ResponsesShell(sessionEngine);

          for await (const event of shell.handleRequest(inputText, {
            responseId,
            model: modelForResponse,
            user,
            createdAt: startedAt,
            sequenceStart: sequenceNumber,
          })) {
            sequenceNumber =
              (event?.data?.sequence_number || sequenceNumber) + 1;
            writeSse(response, event.data);
          }

          response.end();
          return;
        }

        const created = buildResponseObject({
          id: responseId,
          status: "in_progress",
          model: modelForResponse,
          createdAt: startedAt,
          completedAt: null,
          outputText: null,
          user,
        });

        writeSse(response, {
          type: "response.created",
          response: created,
          sequence_number: sequenceNumber++,
        });

        const msgId = `msg_${uuidv4().replace(/-/g, "")}`;
        writeSse(response, {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            id: msgId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
          sequence_number: sequenceNumber++,
        });

        writeSse(response, {
          type: "response.content_part.added",
          item_id: msgId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
          sequence_number: sequenceNumber++,
        });

        let outputText = "";
        if (assistantId) {
          const result = await runAgentInvocation({
            workspace,
            assistantId,
            prompt: inputText,
            thread,
            source: {
              kind: "responses_api",
              user,
              assistantId,
            },
          });
          outputText = String(result?.textResponse || "");
        } else {
          const result = await chatSync({
            workspace,
            message: inputText,
            mode: "chat",
            user: null,
            thread,
            sessionId: null,
            attachments: [],
            reset: false,
          });
          outputText = String(result?.textResponse || "");
        }

        writeSse(response, {
          type: "response.output_text.delta",
          item_id: msgId,
          output_index: 0,
          content_index: 0,
          delta: outputText,
          sequence_number: sequenceNumber++,
        });

        writeSse(response, {
          type: "response.output_text.done",
          item_id: msgId,
          output_index: 0,
          content_index: 0,
          text: outputText,
          sequence_number: sequenceNumber++,
        });

        writeSse(response, {
          type: "response.content_part.done",
          item_id: msgId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: outputText, annotations: [] },
          sequence_number: sequenceNumber++,
        });

        writeSse(response, {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: msgId,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              { type: "output_text", text: outputText, annotations: [] },
            ],
          },
          sequence_number: sequenceNumber++,
        });

        const completed = buildResponseObject({
          id: responseId,
          status: "completed",
          model: modelForResponse,
          createdAt: startedAt,
          completedAt: nowSeconds(),
          outputText,
          messageId: msgId,
          user,
        });

        writeSse(response, {
          type: "response.completed",
          response: completed,
          sequence_number: sequenceNumber++,
        });

        response.end();
        return;
      }

      // Non-streaming
      let outputText = "";
      if (assistantId) {
        const result = await runAgentInvocation({
          workspace,
          assistantId,
          prompt: inputText,
          thread,
          source: {
            kind: "responses_api",
            user,
            assistantId,
          },
        });
        outputText = String(result?.textResponse || "");
      } else {
        const result = await chatSync({
          workspace,
          message: inputText,
          mode: "chat",
          user: null,
          thread,
          sessionId: null,
          attachments: [],
          reset: false,
        });
        outputText = String(result?.textResponse || "");
      }

      const completed = buildResponseObject({
        id: responseId,
        status: "completed",
        model: modelForResponse,
        createdAt: startedAt,
        completedAt: nowSeconds(),
        outputText,
        user,
      });

      return response.status(200).json(completed);
    } catch (error) {
      console.error("[/v1/responses] error:", error);

      // Best-effort streaming error signal
      if (
        response.headersSent &&
        response.getHeader("Content-Type")?.includes("text/event-stream")
      ) {
        writeSse(response, {
          type: "response.failed",
          response: {
            id: responseId,
            object: "response",
            created_at: startedAt,
            status: "failed",
            error: {
              message: error?.message || "Internal error",
              type: "server_error",
              code: "internal_error",
            },
          },
          sequence_number: sequenceNumber++,
        });
        response.end();
        return;
      }

      return response.status(500).json({
        error: {
          message: error?.message || "Internal error",
          type: "server_error",
          code: "internal_error",
        },
      });
    }
  });
}

module.exports = {
  apiResponsesEndpoints,
  responsesInternals: {
    extractInputText,
    buildResponseObject,
    runAgentInvocation,
    runAgentViaSessionEngine,
    createAgentSessionEngine,
  },
};
