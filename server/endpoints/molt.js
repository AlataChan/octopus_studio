const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { MoltHealthMonitor } = require("../utils/molt/healthMonitor");
const crypto = require("crypto");
const { getMoltBroker } = require("../utils/molt/broker");
const { createKmBridge } = require("../utils/molt/kmBridge");
const { uploadTextFileToMolt } = require("../utils/molt/filesBridge");
const { EventLogs } = require("../models/eventLogs");
const { SystemSettings } = require("../models/systemSettings");
const { Workspace } = require("../models/workspace");
const { WorkspaceMoltAgent } = require("../models/workspaceMoltAgent");
const { WorkspaceMoltChat } = require("../models/workspaceMoltChat");
const {
  assertWorkspaceResourceAccess,
} = require("../utils/access/assertWorkspaceResourceAccess");
const {
  requireWorkspaceAdmin,
} = require("../utils/access/requireWorkspaceAdmin");
const { systemAdminGuard } = require("../utils/middleware/systemAdminGuard");

const pendingAttachWarning = "Molt 不可达或 agent 暂时未注册，已 attach 待恢复";
const MAX_STREAM_MESSAGE_LENGTH = 32_000;
const DEFAULT_MOLT_DASHBOARD_URL = "http://127.0.0.1:18889";
let pendingReconnect = null;

function getMonitorClient(response) {
  const monitor = MoltHealthMonitor.getInstance();
  if (!monitor?.client) {
    response.status(503).json({
      success: false,
      error: "Molt client is not configured",
      code: "MOLT_NOT_CONFIGURED",
    });
    return null;
  }
  return monitor.client;
}

function currentUser(request, response) {
  return request.user || response.locals?.user || null;
}

function jsonError(response, status, error, extras = {}) {
  return response.status(status).json({ success: false, error, ...extras });
}

function respondMoltError(
  response,
  error,
  fallbackMessage = "Molt request failed",
  code = "MOLT_REQUEST_FAILED",
  status = 500,
  extras = {}
) {
  console.error("[Molt] endpoint error:", error);
  return response.status(status).json({
    ...extras,
    success: false,
    error: fallbackMessage,
    ...(code ? { code } : {}),
  });
}

const SAFE_MOLT_ERROR_CODES = new Set([
  "MOLT_NOT_CONFIGURED",
  "MOLT_UNAVAILABLE",
  "MOLT_STATUS_ERROR",
  "MOLT_RECONNECT_ERROR",
  "MOLT_MATRIX_INIT_FAILED",
  "MOLT_MATRIX_INIT_UNAUTHORIZED",
  "MOLT_CAPABILITY_ERROR",
  "MOLT_MATRIX_STATUS_ERROR",
  "MOLT_ARCHETYPES_ERROR",
  "MOLT_AGENTS_ERROR",
  "MOLT_AGENT_CHAT_ERROR",
  "MOLT_WORKSPACE_CHAT_ERROR",
  "MOLT_KM_STATUS_ERROR",
  "MOLT_FILE_UPLOAD_ERROR",
  "MOLT_MESSAGE_REQUIRED",
  "molt_thread_stale",
]);

function safeMoltCode(value, fallbackCode) {
  const code = String(value || "");
  return SAFE_MOLT_ERROR_CODES.has(code) ? code : fallbackCode;
}

function safeStatus(value, fallbackStatus = 500) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : fallbackStatus;
}

function respondMoltUpstreamFailure(
  response,
  result,
  fallbackMessage,
  fallbackCode,
  fallbackStatus = 502,
  extras = {}
) {
  return respondMoltError(
    response,
    result,
    fallbackMessage,
    safeMoltCode(result?.code, fallbackCode),
    safeStatus(result?.statusCode, fallbackStatus),
    extras
  );
}

async function getSettingValue(label, fallback = null) {
  try {
    const value = await SystemSettings.getValueOrFallback({ label }, fallback);
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  } catch {
    // env/default fallback below
  }

  const envValue = process.env[label];
  if (envValue !== undefined && envValue !== null && String(envValue).trim()) {
    return String(envValue).trim();
  }

  return fallback;
}

function tokenHash(token) {
  if (!token) return null;
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function moltDashboardUrl() {
  return getSettingValue("MOLT_DASHBOARD_URL", DEFAULT_MOLT_DASHBOARD_URL);
}

async function configuredAdminToken() {
  return getSettingValue("MOLT_ADMIN_TOKEN", null);
}

async function statusExtras(status = {}) {
  const adminToken = await configuredAdminToken();
  const dashboardUrl = await moltDashboardUrl();
  return {
    hasAdminToken: Boolean(adminToken),
    dashboardUrl,
    matrixState: status.matrixState || "unknown",
    agentCount:
      status.agentCount === null || status.agentCount === undefined
        ? 0
        : Number(status.agentCount),
  };
}

async function resolveMatrixInitToken(client) {
  const adminToken = await configuredAdminToken();
  if (adminToken) {
    return { token: adminToken, mode: "admin" };
  }

  console.warn(
    "[MoltMatrixInit] MOLT_ADMIN_TOKEN not configured; using main Molt token"
  );
  const configuredMainToken = await getSettingValue("MOLT_API_TOKEN", null);
  const token =
    configuredMainToken ||
    (typeof client?.getToken === "function" ? await client.getToken() : null);
  return { token, mode: "main" };
}

async function auditMatrixInit({
  success,
  user,
  tokenInfo,
  moltResponse,
  error,
}) {
  const metadata = {
    success,
    userId: user?.id || null,
    triggeredAt: new Date().toISOString(),
    tokenMode: tokenInfo?.mode || "unknown",
    tokenIdHash: tokenHash(tokenInfo?.token),
    ...(moltResponse ? { moltResponse } : {}),
    ...(error ? { error } : {}),
  };
  await EventLogs.logEvent("molt.matrix_init", metadata, user?.id || null);
}

function isSafeWorkspaceSlug(slug) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(String(slug || ""));
}

function readMoltAgentId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function readMessage(value) {
  const message = String(value || "").trim();
  return message || null;
}

function readScopeKey(value) {
  const scopeKey = String(value || "").trim();
  return scopeKey || null;
}

function isMoltAvailable() {
  const monitor = MoltHealthMonitor.getInstance();
  if (typeof monitor?.isAvailable === "function") return monitor.isAvailable();
  if (typeof monitor?.status === "function") {
    const status = monitor.status();
    return status?.state === "CONNECTED";
  }
  return monitor?.isAvailable === true;
}

function startSse(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders?.();
}

function writeSse(response, event, data) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createStreamLifecycle(request, response) {
  const abortController = new AbortController();
  let completed = false;

  const abortUpstream = () => {
    if (completed || abortController.signal.aborted) return;
    abortController.abort();
  };

  const end = () => {
    completed = true;
    request.off?.("aborted", abortUpstream);
    response.off?.("close", abortUpstream);
    if (!response.writableEnded) response.end();
  };

  request.on("aborted", abortUpstream);
  response.on("close", abortUpstream);

  return { abortController, end };
}

async function resolveWorkspaceMoltChatContext(request, response) {
  const context = await resolveWorkspaceAccess(request, response);
  if (!context) return null;

  const moltAgentId = readMoltAgentId(request.params.agentId);
  if (!moltAgentId) {
    jsonError(response, 400, "agentId is required");
    return null;
  }

  const attachment = await WorkspaceMoltAgent.get({
    workspaceId: context.workspace.id,
    moltAgentId,
  });
  if (!attachment) {
    jsonError(response, 404, "Molt agent attachment not found");
    return null;
  }
  if (attachment.enabled === false) {
    jsonError(response, 403, "Molt agent attachment is disabled");
    return null;
  }

  const message = readMessage(request.body?.message);
  if (!message) {
    jsonError(response, 400, "message is required", {
      code: "MOLT_MESSAGE_REQUIRED",
    });
    return null;
  }

  if (message.length > MAX_STREAM_MESSAGE_LENGTH) {
    jsonError(response, 413, "message is too long", {
      code: "MOLT_MESSAGE_TOO_LARGE",
    });
    return null;
  }

  return { ...context, moltAgentId, message };
}

async function resolveWorkspaceAccess(request, response) {
  const { slug } = request.params;
  if (!isSafeWorkspaceSlug(slug)) {
    jsonError(response, 400, "Invalid workspace slug");
    return null;
  }

  const workspace = await Workspace.get({ slug });
  if (!workspace) {
    jsonError(response, 404, "Workspace not found");
    return null;
  }

  const user = currentUser(request, response);
  const access = await assertWorkspaceResourceAccess({
    workspaceId: workspace.id,
    user,
    multiUserMode: response.locals?.multiUserMode,
  });

  if (!access.ok) {
    jsonError(response, access.status || 403, access.error || "Forbidden");
    return null;
  }

  return { workspace, user };
}

async function requireAttachmentAdmin(request, response, workspace, user) {
  const admin = await requireWorkspaceAdmin({
    workspaceId: workspace.id,
    user,
    multiUserMode: response.locals?.multiUserMode,
  });

  if (!admin.ok) {
    jsonError(response, admin.status || 403, admin.error || "Forbidden");
    return false;
  }

  return true;
}

async function validateMoltAgentReference(moltAgentId) {
  try {
    const result = await getMoltBroker().listAgents();
    if (!result?.success) return pendingAttachWarning;

    const agents = Array.isArray(result.agents) ? result.agents : [];
    const found = agents.some((agent) => {
      const id = agent?.id || agent?.agentId || agent?.slug;
      return String(id || "") === String(moltAgentId);
    });
    return found ? null : pendingAttachWarning;
  } catch (_error) {
    return pendingAttachWarning;
  }
}

async function checkMoltAgentExists(moltAgentId) {
  try {
    const result = await getMoltBroker().listAgents();
    if (!result?.success) {
      return { ok: false, unavailable: true, error: result?.error };
    }

    const agents = Array.isArray(result.agents) ? result.agents : [];
    const found = agents.some((agent) => {
      const id = agent?.id || agent?.agentId || agent?.slug;
      return String(id || "") === String(moltAgentId);
    });
    return found
      ? { ok: true }
      : { ok: false, unavailable: false, error: "Molt agent not found" };
  } catch (error) {
    console.error("[Molt] agent existence check failed:", error);
    return {
      ok: false,
      unavailable: true,
      error: "Molt availability check failed",
    };
  }
}

async function auditMoltEvent(
  event,
  { user, workspace, moltAgentId, metadata = {} } = {}
) {
  try {
    await EventLogs.logEvent(
      event,
      {
        user_id: user?.id || null,
        workspace_id: workspace?.id || workspace?.workspace_id || null,
        molt_agent_id: moltAgentId || null,
        occurred_at: new Date().toISOString(),
        ...metadata,
      },
      user?.id || null
    );
  } catch (error) {
    console.warn(`[MoltAudit] ${event} failed:`, error.message);
  }
}

function moltEndpoints(app) {
  if (!app) return;

  app.get(
    "/molt/status",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const status = MoltHealthMonitor.getInstance().status();
        const extras = await statusExtras(status);
        return response
          .status(200)
          .json({ success: true, ...status, ...extras });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to read Molt status",
          "MOLT_STATUS_ERROR"
        );
      }
    }
  );

  app.post(
    "/molt/reconnect",
    [validatedRequest, systemAdminGuard],
    async (request, response) => {
      const user = currentUser(request, response);
      try {
        const monitor = MoltHealthMonitor.getInstance();
        if (!pendingReconnect) {
          pendingReconnect = monitor.manualReconnect().finally(() => {
            pendingReconnect = null;
          });
        }
        const status = await pendingReconnect;
        await auditMoltEvent("molt.reconnect", {
          user,
          metadata: {
            state: status?.state || null,
            success: true,
          },
        });
        return response.status(200).json({ success: true, ...status });
      } catch (error) {
        const status =
          typeof MoltHealthMonitor.getInstance().status === "function"
            ? MoltHealthMonitor.getInstance().status()
            : {};
        await auditMoltEvent("molt.reconnect", {
          user,
          metadata: {
            state: status?.state || null,
            success: false,
            error: error.message,
          },
        });
        return respondMoltError(
          response,
          error,
          "Unable to reconnect Molt",
          "MOLT_RECONNECT_ERROR",
          500,
          status
        );
      }
    }
  );

  app.post(
    "/molt/matrix/init",
    [validatedRequest, systemAdminGuard],
    async (request, response) => {
      const user = currentUser(request, response);
      let tokenInfo = null;
      try {
        if (!isMoltAvailable()) {
          tokenInfo = await resolveMatrixInitToken(null);
          await auditMatrixInit({
            success: false,
            user,
            tokenInfo,
            error: "Molt is offline",
          });
          return jsonError(response, 503, "Molt is offline", {
            code: "molt_offline",
          });
        }

        const client = getMonitorClient(response);
        if (!client) return;

        tokenInfo = await resolveMatrixInitToken(client);
        const result = await client.matrixInit({
          adminToken: tokenInfo.token || null,
        });

        if (result?.ok === false) {
          const { error: upstreamError } = result;
          const error = upstreamError || "Molt Matrix init failed";
          await auditMatrixInit({
            success: false,
            user,
            tokenInfo,
            error,
            moltResponse: result.body || result,
          });

          if (Number(result.statusCode) === 401) {
            return respondMoltError(
              response,
              result,
              "Molt Matrix init unauthorized",
              "MOLT_MATRIX_INIT_UNAUTHORIZED",
              401,
              {
                hint: "Configure MOLT_ADMIN_TOKEN with Matrix init permissions.",
              }
            );
          }

          return respondMoltUpstreamFailure(
            response,
            result,
            "Molt Matrix init failed",
            "MOLT_MATRIX_INIT_FAILED",
            502
          );
        }

        await auditMatrixInit({
          success: true,
          user,
          tokenInfo,
          moltResponse: result,
        });
        return response.status(200).json({
          success: true,
          moltResponse: result,
        });
      } catch (error) {
        await auditMatrixInit({
          success: false,
          user,
          tokenInfo,
          error: error.message,
        });

        const status = Number(error.statusCode) || 500;
        if (status === 401) {
          return jsonError(response, 401, "Molt Matrix init unauthorized", {
            code: "MOLT_MATRIX_INIT_UNAUTHORIZED",
            hint: "Configure MOLT_ADMIN_TOKEN with Matrix init permissions.",
          });
        }
        return respondMoltError(
          response,
          error,
          "Molt Matrix init failed",
          "MOLT_MATRIX_INIT_FAILED",
          status >= 500 ? 502 : status
        );
      }
    }
  );

  app.get(
    "/molt/capability",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const client = getMonitorClient(response);
        if (!client) return;
        const capability = await client.capabilitySnapshot();
        if (capability?.ok === false) {
          return respondMoltUpstreamFailure(
            response,
            capability,
            "Unable to read Molt capability",
            "MOLT_CAPABILITY_ERROR",
            502
          );
        }
        return response.status(200).json({ success: true, capability });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to read Molt capability",
          "MOLT_CAPABILITY_ERROR"
        );
      }
    }
  );

  app.get(
    "/molt/mission-control/status",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const client = getMonitorClient(response);
        if (!client) return;
        const status = await client.matrixStatus({ includeAgents: true });
        if (status?.ok === false) {
          return respondMoltUpstreamFailure(
            response,
            status,
            "Unable to read Molt mission status",
            "MOLT_MATRIX_STATUS_ERROR",
            502
          );
        }
        return response.status(200).json({ success: true, status });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to read Molt mission status",
          "MOLT_MATRIX_STATUS_ERROR"
        );
      }
    }
  );

  app.get(
    "/molt/mission-control/archetypes",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const client = getMonitorClient(response);
        if (!client) return;
        const result = await client.matrixArchetypes();
        if (result?.ok === false) {
          return respondMoltUpstreamFailure(
            response,
            result,
            "Unable to read Molt archetypes",
            "MOLT_ARCHETYPES_ERROR",
            502
          );
        }
        return response.status(200).json({
          success: true,
          archetypes: Array.isArray(result?.data) ? result.data : [],
          ...(result?.contract ? { contract: result.contract } : {}),
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to read Molt archetypes",
          "MOLT_ARCHETYPES_ERROR"
        );
      }
    }
  );

  app.get(
    "/molt/agents",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const result = await getMoltBroker().listAgents();
        if (!result.success) {
          return respondMoltUpstreamFailure(
            response,
            result,
            "Unable to list Molt agents",
            "MOLT_AGENTS_ERROR",
            503
          );
        }
        return response.status(200).json({
          success: true,
          agents: Array.isArray(result.agents) ? result.agents : [],
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to list Molt agents",
          "MOLT_AGENTS_ERROR"
        );
      }
    }
  );

  app.post(
    "/molt/agents/:agentId/chat",
    [validatedRequest, systemAdminGuard],
    async (request, response) => {
      try {
        const user = request.user || response.locals?.user || {};
        const result = await getMoltBroker().askAgent({
          agentId: request.params.agentId,
          message: request.body?.message,
          conversationId: request.body?.conversationId,
          userId: user.id || "alata-user",
          userName: user.username || user.name || "Alata User",
        });
        if (!result.success) {
          const messageRequired = result.code === "MOLT_MESSAGE_REQUIRED";
          return respondMoltError(
            response,
            result,
            messageRequired
              ? "message is required"
              : "Unable to chat with Molt agent",
            messageRequired ? "MOLT_MESSAGE_REQUIRED" : "MOLT_AGENT_CHAT_ERROR",
            messageRequired ? 400 : safeStatus(result.statusCode, 503)
          );
        }
        return response.status(200).json({
          success: true,
          answer: result.answer || "",
          conversationId: result.conversationId || null,
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to chat with Molt agent",
          "MOLT_AGENT_CHAT_ERROR"
        );
      }
    }
  );

  app.post(
    "/workspace/:slug/molt-agents/:agentId/chat",
    [validatedRequest],
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(request, response);
        if (!context) return;

        const moltAgentId = readMoltAgentId(request.params.agentId);
        if (!moltAgentId) {
          return jsonError(response, 400, "agentId is required");
        }

        const attachment = await WorkspaceMoltAgent.get({
          workspaceId: context.workspace.id,
          moltAgentId,
        });
        if (!attachment) {
          return jsonError(response, 404, "Molt agent attachment not found");
        }
        if (attachment.enabled === false) {
          return jsonError(response, 403, "Molt agent attachment is disabled");
        }

        const message = readMessage(request.body?.message);
        if (!message) {
          return jsonError(response, 400, "message is required", {
            code: "MOLT_MESSAGE_REQUIRED",
          });
        }

        if (!isMoltAvailable()) {
          return jsonError(response, 503, "Molt is offline", {
            code: "molt_offline",
          });
        }

        const result = await getMoltBroker().chat({
          agentId: moltAgentId,
          message,
          threadId: request.body?.threadId,
          scopeKey: request.body?.scopeKey,
          userId: context.user?.id || "alata-user",
          userName:
            context.user?.username || context.user?.name || "Alata User",
        });

        if (!result.success) {
          const { error: upstreamError } = result;
          await auditMoltEvent("molt.chat_failed", {
            user: context.user,
            workspace: context.workspace,
            moltAgentId,
            metadata: {
              error: upstreamError || "Molt chat failed",
              code: result.code || null,
              statusCode: result.statusCode || null,
            },
          });
          return respondMoltError(
            response,
            result,
            result.threadStale
              ? "Molt thread not found"
              : "Unable to chat with workspace Molt agent",
            result.threadStale
              ? "molt_thread_stale"
              : "MOLT_WORKSPACE_CHAT_ERROR",
            result.threadStale ? 409 : safeStatus(result.statusCode, 503),
            result.threadStale ? { threadStale: true } : {}
          );
        }

        return response.status(200).json({
          success: true,
          reply: result.reply || "",
          molt_thread_id: result.molt_thread_id || null,
          chatId: result.chatId || null,
        });
      } catch (error) {
        await auditMoltEvent("molt.chat_failed", {
          user: currentUser(request, response),
          workspace: null,
          moltAgentId: request.params?.agentId,
          metadata: { error: error.message },
        });
        return respondMoltError(
          response,
          error,
          "Unable to chat with workspace Molt agent",
          "MOLT_WORKSPACE_CHAT_ERROR"
        );
      }
    }
  );

  app.post(
    "/workspace/:slug/molt-agents/:agentId/chat/stream",
    [validatedRequest],
    async (request, response) => {
      const context = await resolveWorkspaceMoltChatContext(request, response);
      if (!context) return;

      const scopeKey = readScopeKey(request.body?.scopeKey);
      if (!scopeKey) {
        return jsonError(response, 400, "scopeKey is required", {
          code: "MOLT_SCOPE_KEY_REQUIRED",
        });
      }

      if (!isMoltAvailable()) {
        return jsonError(response, 503, "Molt is offline", {
          code: "molt_offline",
        });
      }

      const { abortController, end } = createStreamLifecycle(request, response);

      startSse(response);

      let seq = 0;
      let activePointer = null;
      try {
        activePointer = await WorkspaceMoltChat.getActive({
          workspaceId: context.workspace.id,
          moltAgentId: context.moltAgentId,
          scopeKey,
        });

        const result = await getMoltBroker().streamChat({
          moltAgentId: context.moltAgentId,
          message: context.message,
          threadId:
            request.body?.threadId || activePointer?.molt_thread_id || null,
          scopeKey,
          userId: context.user?.id || "alata-user",
          userName:
            context.user?.username || context.user?.name || "Alata User",
          signal: abortController.signal,
          onChunk: (text) => {
            if (abortController.signal.aborted) return;
            seq += 1;
            writeSse(response, "chunk", { text, seq });
          },
        });

        if (abortController.signal.aborted) return end();

        const moltThreadId =
          result?.molt_thread_id || request.body?.threadId || null;
        let pointer = null;
        if (moltThreadId) {
          pointer = await WorkspaceMoltChat.upsert({
            workspaceId: context.workspace.id,
            moltAgentId: context.moltAgentId,
            scopeKey,
            createdByUserId: context.user?.id || null,
            moltThreadId,
          });
          if (pointer?.id) {
            await WorkspaceMoltChat.bumpLastUserMessage({ id: pointer.id });
          }
        }

        writeSse(response, "done", {
          chatId: result?.chatId || null,
          molt_thread_id: moltThreadId,
        });
        return end();
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          error?.code === "ABORT_ERR" ||
          error?.code === "ABORTED"
        ) {
          return end();
        }

        if (error?.code === "thread_stale") {
          if (activePointer?.id) {
            await WorkspaceMoltChat.markStale({ id: activePointer.id });
          }
          await auditMoltEvent("molt.chat_failed", {
            user: context.user,
            workspace: context.workspace,
            moltAgentId: context.moltAgentId,
            metadata: {
              error: "Molt thread not found",
              code: "thread_stale",
            },
          });
          writeSse(response, "error", {
            code: "thread_stale",
            message: "Molt thread not found",
          });
          return end();
        }

        await auditMoltEvent("molt.chat_failed", {
          user: context.user,
          workspace: context.workspace,
          moltAgentId: context.moltAgentId,
          metadata: {
            error: error.message,
            code: error.code || "MOLT_STREAM_ERROR",
          },
        });
        writeSse(response, "error", {
          code: "MOLT_STREAM_ERROR",
          message: "Molt stream failed",
        });
        return end();
      }
    }
  );

  app.get(
    "/workspace/:slug/molt-agents",
    [validatedRequest],
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(request, response);
        if (!context) return;

        const agents = await WorkspaceMoltAgent.where({
          workspaceId: context.workspace.id,
        });
        return response.status(200).json({
          success: true,
          agents,
          moltAvailable: isMoltAvailable(),
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to list workspace Molt agents",
          "MOLT_WORKSPACE_AGENTS_ERROR"
        );
      }
    }
  );

  app.post(
    "/workspace/:slug/molt-agents",
    [validatedRequest],
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(request, response);
        if (!context) return;
        const allowed = await requireAttachmentAdmin(
          request,
          response,
          context.workspace,
          context.user
        );
        if (!allowed) return;

        const moltAgentId = readMoltAgentId(request.body?.moltAgentId);
        if (!moltAgentId) {
          return jsonError(response, 400, "moltAgentId is required");
        }

        const warning = await validateMoltAgentReference(moltAgentId);
        const agent = await WorkspaceMoltAgent.attach({
          workspaceId: context.workspace.id,
          moltAgentId,
          displayName: request.body?.displayName,
          metadata: request.body?.metadata,
        });

        if (!agent) {
          return jsonError(response, 500, "Unable to attach Molt agent");
        }

        await auditMoltEvent("molt.attach", {
          user: context.user,
          workspace: context.workspace,
          moltAgentId,
          metadata: {
            warning: warning || null,
          },
        });

        return response.status(200).json({
          success: true,
          agent,
          ...(warning ? { warning } : {}),
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to attach workspace Molt agent",
          "MOLT_WORKSPACE_AGENT_ATTACH_ERROR"
        );
      }
    }
  );

  app.patch(
    "/workspace/:slug/molt-agents/:agentId",
    [validatedRequest],
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(request, response);
        if (!context) return;
        const allowed = await requireAttachmentAdmin(
          request,
          response,
          context.workspace,
          context.user
        );
        if (!allowed) return;

        const moltAgentId = readMoltAgentId(request.params.agentId);
        if (!moltAgentId)
          return jsonError(response, 400, "agentId is required");

        const existing = await WorkspaceMoltAgent.get({
          workspaceId: context.workspace.id,
          moltAgentId,
        });
        if (!existing) {
          return jsonError(response, 404, "Molt agent attachment not found");
        }

        const hasDisplayName = Object.prototype.hasOwnProperty.call(
          request.body || {},
          "displayName"
        );
        const hasMetadata = Object.prototype.hasOwnProperty.call(
          request.body || {},
          "metadata"
        );
        const hasEnabled = Object.prototype.hasOwnProperty.call(
          request.body || {},
          "enabled"
        );

        if (hasEnabled && typeof request.body.enabled !== "boolean") {
          return jsonError(response, 400, "enabled must be a boolean");
        }

        let agent = existing;
        if (hasDisplayName || hasMetadata) {
          agent = await WorkspaceMoltAgent.attach({
            workspaceId: context.workspace.id,
            moltAgentId,
            displayName: request.body.displayName,
            metadata: request.body.metadata,
          });
        }

        if (hasEnabled) {
          if (request.body.enabled === true && existing.enabled === false) {
            const existence = await checkMoltAgentExists(moltAgentId);
            if (!existence.ok) {
              return jsonError(
                response,
                existence.unavailable ? 503 : 409,
                existence.error || "Molt agent is not currently available",
                {
                  code: existence.unavailable
                    ? "molt_unavailable"
                    : "MOLT_AGENT_NOT_FOUND",
                }
              );
            }
          }
          agent = request.body.enabled
            ? await WorkspaceMoltAgent.enable({
                workspaceId: context.workspace.id,
                moltAgentId,
              })
            : await WorkspaceMoltAgent.disable({
                workspaceId: context.workspace.id,
                moltAgentId,
              });
        }

        if (!agent) {
          return jsonError(response, 500, "Unable to update Molt agent");
        }
        return response.status(200).json({ success: true, agent });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to update workspace Molt agent",
          "MOLT_WORKSPACE_AGENT_UPDATE_ERROR"
        );
      }
    }
  );

  app.delete(
    "/workspace/:slug/molt-agents/:agentId",
    [validatedRequest],
    async (request, response) => {
      try {
        const context = await resolveWorkspaceAccess(request, response);
        if (!context) return;
        const allowed = await requireAttachmentAdmin(
          request,
          response,
          context.workspace,
          context.user
        );
        if (!allowed) return;

        const moltAgentId = readMoltAgentId(request.params.agentId);
        if (!moltAgentId)
          return jsonError(response, 400, "agentId is required");

        const removed = await WorkspaceMoltAgent.remove({
          workspaceId: context.workspace.id,
          moltAgentId,
        });
        if (!removed) {
          return jsonError(response, 404, "Molt agent attachment not found");
        }
        await auditMoltEvent("molt.detach", {
          user: context.user,
          workspace: context.workspace,
          moltAgentId,
        });
        return response.status(200).json({ success: true });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to remove workspace Molt agent",
          "MOLT_WORKSPACE_AGENT_REMOVE_ERROR"
        );
      }
    }
  );

  app.get(
    "/molt/km/status",
    [validatedRequest, systemAdminGuard],
    async (_request, response) => {
      try {
        const client = getMonitorClient(response);
        if (!client) return;
        const result = await createKmBridge({ client }).status();
        if (!result.success) {
          return respondMoltUpstreamFailure(
            response,
            result,
            "Unable to read Molt KM status",
            "MOLT_KM_STATUS_ERROR",
            503
          );
        }
        return response.status(200).json({
          success: true,
          km: result.km || {},
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to read Molt KM status",
          "MOLT_KM_STATUS_ERROR"
        );
      }
    }
  );

  app.post(
    "/molt/files/upload-text",
    [validatedRequest, systemAdminGuard],
    async (request, response) => {
      try {
        const client = getMonitorClient(response);
        if (!client) return;
        const result = await uploadTextFileToMolt({
          client,
          agentId: request.body?.agentId,
          filename: request.body?.filename,
          content: request.body?.content,
        });
        if (!result.success) {
          const status =
            result.code === "MOLT_FILE_UPLOAD_ERROR"
              ? safeStatus(result.statusCode, 502)
              : 400;
          return respondMoltError(
            response,
            result,
            "Unable to upload text to Molt",
            safeMoltCode(result.code, "MOLT_FILE_UPLOAD_ERROR"),
            status
          );
        }
        return response.status(200).json({
          success: true,
          upload: result.upload || null,
        });
      } catch (error) {
        return respondMoltError(
          response,
          error,
          "Unable to upload text to Molt",
          "MOLT_FILE_UPLOAD_ERROR"
        );
      }
    }
  );
}

module.exports = { moltEndpoints };
