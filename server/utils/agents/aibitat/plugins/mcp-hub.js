const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { McpHubClient } = require("../../../mcpHub/client");
const { safeJsonParse } = require("../../../http");
const { DataSanitizer } = require("../../../dataSanitizer");

function normalizeCsv(value) {
  if (!value) return [];
  if (Array.isArray(value))
    return value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function storageRoot() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  return path.resolve(__dirname, "../../../../storage");
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
}

function toRiskOrder(level) {
  const v = String(level || "").toLowerCase();
  return { read: 0, write: 1, money: 2, admin: 3 }[v] ?? 3;
}

function normalizeRiskLevel(level) {
  const v = String(level || "").toLowerCase();
  if (["read", "write", "money", "admin"].includes(v)) return v;
  return "admin";
}

function isToolPrefixAllowed(
  toolId,
  { allowedToolPrefixes, denyToolPrefixes }
) {
  const id = String(toolId || "");
  if (!id) return false;

  const denied = (denyToolPrefixes || []).some((p) => id.startsWith(String(p)));
  if (denied) return false;

  const allowed = allowedToolPrefixes || [];
  if (allowed.length === 0) return false; // deny-by-default
  return allowed.some((p) => id.startsWith(String(p)));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDecision(
  WorkflowPendingConfirmation,
  confirmationId,
  maxWaitSeconds = 300
) {
  const start = Date.now();
  const pollIntervalMs = 2000;

  while (Date.now() - start < maxWaitSeconds * 1000) {
    const confirmation = await WorkflowPendingConfirmation.get(confirmationId);
    if (!confirmation) {
      return { approved: false, userResponse: "Confirmation record not found" };
    }

    if (confirmation.status === "approved") {
      return {
        approved: true,
        userResponse: confirmation.userResponse || null,
      };
    }
    if (confirmation.status === "rejected") {
      return {
        approved: false,
        userResponse: confirmation.userResponse || null,
      };
    }
    if (confirmation.status === "expired") {
      return {
        approved: false,
        expired: true,
        userResponse: "Confirmation expired",
      };
    }

    await sleep(pollIntervalMs);
  }

  await WorkflowPendingConfirmation.expire(confirmationId);
  return {
    approved: false,
    expired: true,
    userResponse: "Confirmation timeout",
  };
}

function summarizeSchema(schema) {
  const s = schema && typeof schema === "object" ? schema : {};
  const props =
    s.properties && typeof s.properties === "object" ? s.properties : {};
  const required = Array.isArray(s.required) ? s.required : [];

  const propertySummary = {};
  for (const [key, val] of Object.entries(props)) {
    const type =
      val?.type || (Array.isArray(val?.anyOf) ? "anyOf" : typeof val);
    propertySummary[key] = {
      type,
      description: val?.description || "",
      enum: Array.isArray(val?.enum) ? val.enum : undefined,
    };
  }

  return { type: s.type || "object", required, properties: propertySummary };
}

const mcpHub = {
  name: "mcp_hub",
  startupConfig: {
    params: {
      hubUrl: process.env.MCP_HUB_URL || "",
      hubToken: process.env.MCP_HUB_TOKEN || "",
      allowedToolPrefixes: normalizeCsv(
        process.env.MCP_HUB_ALLOWED_TOOL_PREFIXES
      ),
      denyToolPrefixes: normalizeCsv(process.env.MCP_HUB_DENY_TOOL_PREFIXES),
      riskLevelMaxWithoutApproval:
        process.env.MCP_HUB_RISK_LEVEL_MAX_WITHOUT_APPROVAL || "read",
      toolListCacheSeconds: parseInt(
        process.env.MCP_HUB_TOOL_LIST_CACHE_SECONDS || "60"
      ),
      timeoutMs: parseInt(process.env.MCP_HUB_TIMEOUT_MS || "30000"),
    },
  },
  plugin: function (callOpts = {}) {
    const opts = callOpts || {};

    // Lazy deps injection for tests; production falls back to real modules.
    const deps = opts.__deps || {};
    const WorkflowPendingConfirmation =
      deps.WorkflowPendingConfirmation ||
      require("../../../../models/workflowPendingConfirmation")
        .WorkflowPendingConfirmation;
    const Run = deps.Run || require("../../../../models/run").Run;
    const RunArtifact =
      deps.RunArtifact || require("../../../../models/runArtifact").RunArtifact;
    const runEventEmitter =
      deps.runEventEmitter ||
      require("../../../liveCanvas/runEventEmitter").runEventEmitter;
    const SSE_EVENTS =
      deps.SSE_EVENTS || require("../../../liveCanvas/types").SSE_EVENTS;

    const hubUrl = String(opts.hubUrl || process.env.MCP_HUB_URL || "").trim();
    const hubToken = String(
      opts.hubToken || process.env.MCP_HUB_TOKEN || ""
    ).trim();
    const allowedToolPrefixes = normalizeCsv(
      opts.allowedToolPrefixes ?? process.env.MCP_HUB_ALLOWED_TOOL_PREFIXES
    );
    const denyToolPrefixes = normalizeCsv(
      opts.denyToolPrefixes ?? process.env.MCP_HUB_DENY_TOOL_PREFIXES
    );
    const riskLevelMaxWithoutApproval = normalizeRiskLevel(
      opts.riskLevelMaxWithoutApproval ??
        process.env.MCP_HUB_RISK_LEVEL_MAX_WITHOUT_APPROVAL ??
        "read"
    );
    const toolListCacheSeconds = parseInt(
      String(
        opts.toolListCacheSeconds ??
          process.env.MCP_HUB_TOOL_LIST_CACHE_SECONDS ??
          "60"
      )
    );
    const timeoutMs = parseInt(
      String(opts.timeoutMs ?? process.env.MCP_HUB_TIMEOUT_MS ?? "30000")
    );

    // Allow tests to inject an already-constructed client.
    const hubClient =
      opts.hubClient ||
      (hubUrl
        ? new McpHubClient({
            baseUrl: hubUrl,
            token: hubToken || null,
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30_000,
          })
        : null);

    // Simple in-memory cache per plugin instance.
    const toolCache = { fetchedAt: 0, tools: [] };

    async function getToolsFresh() {
      if (!hubClient) {
        throw new Error(
          "MCP Hub is not configured. Set MCP_HUB_URL/MCP_HUB_TOKEN (or provide hubUrl/hubToken in plugin params)."
        );
      }

      const now = Date.now();
      const ttlMs = Math.max(
        0,
        (Number.isFinite(toolListCacheSeconds) ? toolListCacheSeconds : 60) *
          1000
      );
      if (toolCache.tools.length > 0 && now - toolCache.fetchedAt < ttlMs) {
        return toolCache.tools;
      }

      const result = await hubClient.toolsList();
      const tools = Array.isArray(result?.tools) ? result.tools : [];
      toolCache.fetchedAt = now;
      toolCache.tools = tools;
      return tools;
    }

    function resolveToolByRef(tools, toolRef) {
      const ref = String(toolRef || "");
      if (!ref) return null;
      return tools.find((t) => String(t.toolRef || "") === ref) || null;
    }

    function effectiveAuthMode(aibitat) {
      const raw = String(
        aibitat?.handlerProps?.authorizationMode || ""
      ).toLowerCase();
      return raw === "full_authorize" || raw === "full-authorize"
        ? "full_authorize"
        : "hitl";
    }

    async function writeAuditArtifact({
      aibitat,
      runId,
      threadSlug,
      label,
      payload,
      metadata = {},
    }) {
      if (!runId) return null;

      const root = storageRoot();
      const dir = path.join(root, "runs", String(runId), "mcp_hub");
      ensureDir(dir);

      const filename = `${Date.now()}-${uuidv4()}.json`;
      const absPath = path.join(dir, filename);
      const relPath = path.relative(root, absPath);
      const json = JSON.stringify(payload, null, 2);
      fs.writeFileSync(absPath, json, "utf8");

      const artifact = await RunArtifact.create({
        runId: String(runId),
        artifactType: "mcp_hub_audit",
        label: label || "mcp_hub audit",
        storageRef: relPath,
        mimeType: "application/json",
        sizeBytes: Buffer.byteLength(json, "utf8"),
        metadata,
      });

      if (threadSlug) {
        runEventEmitter.emitForSession(
          threadSlug,
          SSE_EVENTS.ARTIFACT_CREATED,
          {
            artifactId: artifact.id,
            runId: String(runId),
            artifactType: artifact.artifactType,
            label: artifact.label,
            createdAt: artifact.createdAt,
            metadata: safeJsonParse(artifact.metadata, {}),
          }
        );
      }

      return artifact;
    }

    async function requireApproval({
      aibitat,
      tool,
      toolArgs,
      reason,
      idempotencyKey,
    }) {
      const runId = aibitat?.handlerProps?.runId || null;
      const threadSlug = aibitat?.handlerProps?.threadSlug || null;
      const invocation = aibitat?.handlerProps?.invocation || null;
      const workspaceId =
        aibitat?.handlerProps?.workspaceId ?? invocation?.workspace_id ?? null;
      const userId =
        invocation?.user_id ?? aibitat?.handlerProps?.user?.id ?? null;
      const threadId = invocation?.thread_id ?? null;

      if (!workspaceId) return { approved: true, skipped: true };

      const sanitizedArgs = safeJsonParse(
        DataSanitizer.sanitize(toolArgs, { maxLength: 2000 }),
        {}
      );
      const riskLevel = normalizeRiskLevel(tool?.riskLevel || "admin");

      const confirmation = await WorkflowPendingConfirmation.create({
        workspaceId: Number(workspaceId),
        userId: userId != null ? Number(userId) : null,
        threadId: threadId != null ? Number(threadId) : null,
        chatId: null,
        planType: "tool_call",
        planTitle: `MCP Hub 工具调用确认: ${tool?.toolId || "unknown"}`,
        planDetails: {
          toolName: "mcp_hub.call",
          toolId: tool?.toolId || null,
          toolRef: tool?.toolRef || null,
          category: tool?.category || null,
          riskLevel,
          reason,
          idempotencyKey: idempotencyKey || null,
          toolArgs: sanitizedArgs,
        },
        riskLevel:
          riskLevel === "read"
            ? "low"
            : riskLevel === "write"
              ? "medium"
              : "high",
        timeoutMinutes: 5,
        runId: runId ? String(runId) : null,
      });

      if (threadSlug && runId) {
        runEventEmitter.emitForSession(
          threadSlug,
          SSE_EVENTS.APPROVAL_REQUESTED,
          {
            approvalId: String(confirmation.id),
            runId: String(runId),
            toolName: tool?.toolId || "mcp_hub.call",
            riskLevel,
            planTitle: confirmation.planTitle,
            expiresAt: confirmation.expiresAt,
          }
        );
      }

      if (runId) {
        const blocked = await Run.updateStatus(runId, Run.STATUS.BLOCKED, {});
        if (threadSlug) {
          runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_BLOCKED, {
            runId: blocked.id,
            status: blocked.status,
            updatedAt: blocked.updatedAt,
          });
        }
      }

      aibitat?.introspect?.(
        `⏸️ MCP Hub 调用需要审批（ID: ${confirmation.id}）`
      );

      const decision = await waitForDecision(
        WorkflowPendingConfirmation,
        confirmation.id,
        300
      );
      if (!decision.approved) {
        if (runId) {
          const failed = await Run.updateStatus(runId, Run.STATUS.FAILED, {
            errorCode: decision.expired
              ? Run.ERROR_CODE.HITL_EXPIRED
              : Run.ERROR_CODE.HITL_REJECTED,
            errorDetail: decision.userResponse || "",
          });
          if (threadSlug) {
            runEventEmitter.emitForSession(
              threadSlug,
              SSE_EVENTS.RUN_COMPLETED,
              {
                runId: failed.id,
                status: failed.status,
                errorCode: failed.errorCode,
                errorDetail: failed.errorDetail,
                completedAt: failed.completedAt,
              }
            );
          }
        }
        return decision;
      }

      if (runId) {
        const resumed = await Run.updateStatus(runId, Run.STATUS.RUNNING, {});
        if (threadSlug) {
          runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_UPDATED, {
            runId: resumed.id,
            status: resumed.status,
            updatedAt: resumed.updatedAt,
          });
        }
      }

      aibitat?.introspect?.(
        `✅ 审批通过，继续执行 MCP Hub 工具 "${tool?.toolId || ""}"`
      );
      return decision;
    }

    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: "mcp_hub",
          description:
            "Broker tool for MCP Hub: discover tools (search/schema) and execute via toolRef with strict policy + optional HITL approvals.",
          examples: [
            {
              prompt: "Search MCP Hub tools for rag search",
              call: JSON.stringify({
                action: "search",
                query: "rag",
                limit: 5,
              }),
            },
            {
              prompt: "Show schema of a tool",
              call: JSON.stringify({
                action: "schema",
                toolRef: "hubref_v1:tool",
                schemaMode: "summary",
              }),
            },
            {
              prompt: "Call a tool",
              call: JSON.stringify({
                action: "call",
                toolRef: "hubref_v1:tool",
                args: { query: "hello" },
                idempotencyKey: "idem-123",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "search",
                  "schema",
                  "call",
                  "task.status",
                  "task.result",
                  "file.get",
                ],
              },

              query: { type: "string" },
              limit: { type: "number" },
              filters: {
                type: "object",
                properties: {
                  category: { type: "array", items: { type: "string" } },
                  riskLevelMax: {
                    type: "string",
                    enum: ["read", "write", "money", "admin"],
                  },
                },
                additionalProperties: false,
              },

              toolRef: { type: "string" },
              schemaMode: {
                type: "string",
                enum: ["summary", "full"],
              },

              args: { type: "object" },
              idempotencyKey: { type: "string" },
              dryRun: { type: "boolean" },

              taskId: { type: "string" },
              fileId: { type: "string" },
            },
            required: ["action"],
            additionalProperties: false,
          },

          handler: async function (params = {}) {
            const action = String(params.action || "").trim();
            const authMode = effectiveAuthMode(this.super);

            try {
              if (action === "search") {
                const tools = await getToolsFresh();
                const q = String(params.query || "").toLowerCase();
                const limit = Math.max(
                  1,
                  Math.min(50, parseInt(params.limit || 10))
                );
                const categoryFilter = Array.isArray(params.filters?.category)
                  ? params.filters.category.map(String)
                  : [];
                const riskMax = params.filters?.riskLevelMax
                  ? normalizeRiskLevel(params.filters.riskLevelMax)
                  : null;

                const filtered = tools
                  .filter((t) => {
                    const toolId = String(t.toolId || "");
                    if (
                      !isToolPrefixAllowed(toolId, {
                        allowedToolPrefixes,
                        denyToolPrefixes,
                      })
                    ) {
                      return false;
                    }
                    if (
                      categoryFilter.length > 0 &&
                      !categoryFilter.includes(String(t.category || ""))
                    ) {
                      return false;
                    }
                    if (riskMax) {
                      const risk = normalizeRiskLevel(t.riskLevel || "admin");
                      if (toRiskOrder(risk) > toRiskOrder(riskMax))
                        return false;
                    }
                    if (!q) return true;
                    const hay =
                      `${toolId} ${t.title || ""} ${t.description || ""}`.toLowerCase();
                    return hay.includes(q);
                  })
                  .slice(0, limit)
                  .map((t) => ({
                    toolId: t.toolId,
                    toolRef: t.toolRef,
                    title: t.title,
                    description: t.description,
                    category: t.category,
                    riskLevel: normalizeRiskLevel(t.riskLevel || "admin"),
                    version: t.version,
                  }));

                return JSON.stringify({ ok: true, action, tools: filtered });
              }

              if (action === "schema") {
                const toolRef = String(params.toolRef || "").trim();
                if (!toolRef)
                  return JSON.stringify({
                    ok: false,
                    error: "toolRef is required",
                  });

                const tools = await getToolsFresh();
                const tool = resolveToolByRef(tools, toolRef);
                if (!tool)
                  return JSON.stringify({
                    ok: false,
                    error: "toolRef not found",
                  });

                if (
                  !isToolPrefixAllowed(tool.toolId, {
                    allowedToolPrefixes,
                    denyToolPrefixes,
                  })
                ) {
                  return JSON.stringify({
                    ok: false,
                    error: "tool is not allowed by policy",
                  });
                }

                const mode = String(params.schemaMode || "summary");
                const schema = tool.inputSchema || {};
                return JSON.stringify({
                  ok: true,
                  action,
                  tool: {
                    toolId: tool.toolId,
                    toolRef: tool.toolRef,
                    title: tool.title,
                    description: tool.description,
                    category: tool.category,
                    riskLevel: normalizeRiskLevel(tool.riskLevel || "admin"),
                    version: tool.version,
                    inputSchema:
                      mode === "full" ? schema : summarizeSchema(schema),
                  },
                });
              }

              if (action === "call") {
                const toolRef = String(params.toolRef || "").trim();
                if (!toolRef)
                  return JSON.stringify({
                    ok: false,
                    error: "toolRef is required",
                  });

                const tools = await getToolsFresh();
                const tool = resolveToolByRef(tools, toolRef);
                if (!tool)
                  return JSON.stringify({
                    ok: false,
                    error: "toolRef not found",
                  });

                if (
                  !isToolPrefixAllowed(tool.toolId, {
                    allowedToolPrefixes,
                    denyToolPrefixes,
                  })
                ) {
                  return JSON.stringify({
                    ok: false,
                    error: "tool is not allowed by policy",
                  });
                }

                const toolRisk = normalizeRiskLevel(tool.riskLevel || "admin");
                const maxWithoutApproval = normalizeRiskLevel(
                  riskLevelMaxWithoutApproval || "read"
                );

                const rawArgs =
                  params.args && typeof params.args === "object"
                    ? params.args
                    : {};
                const sanitizedArgs = safeJsonParse(
                  DataSanitizer.sanitize(rawArgs, { maxLength: 2000 }),
                  {}
                );

                let idempotencyKey = params.idempotencyKey
                  ? String(params.idempotencyKey)
                  : null;
                const needsApproval =
                  authMode !== "full_authorize" &&
                  toRiskOrder(toolRisk) > toRiskOrder(maxWithoutApproval);
                if (needsApproval && !idempotencyKey)
                  idempotencyKey = `hubcall_${uuidv4()}`;

                if (needsApproval) {
                  const decision = await requireApproval({
                    aibitat: this.super,
                    tool,
                    toolArgs: sanitizedArgs,
                    reason: `riskLevel=${toolRisk} > ${maxWithoutApproval}`,
                    idempotencyKey,
                  });
                  if (!decision.approved) {
                    return JSON.stringify({
                      ok: false,
                      approvalRequired: true,
                      decision,
                      toolId: tool.toolId,
                      toolRef,
                    });
                  }
                }

                const t0 = Date.now();
                const result = await hubClient.toolsCall({
                  toolRef,
                  args: sanitizedArgs,
                  idempotencyKey,
                  dryRun: !!params.dryRun,
                });

                await writeAuditArtifact({
                  aibitat: this.super,
                  runId: this.super?.handlerProps?.runId || null,
                  threadSlug: this.super?.handlerProps?.threadSlug || null,
                  label: `mcp_hub.call ${tool.toolId}`,
                  payload: {
                    action,
                    toolId: tool.toolId,
                    toolRef,
                    riskLevel: toolRisk,
                    category: tool.category || null,
                    version: tool.version || null,
                    authMode,
                    idempotencyKey,
                    args: sanitizedArgs,
                    result: safeJsonParse(
                      DataSanitizer.sanitize(result, { maxLength: 4000 }),
                      result
                    ),
                    durationMs: Date.now() - t0,
                  },
                  metadata: {
                    action,
                    toolId: tool.toolId,
                    riskLevel: toolRisk,
                    category: tool.category || null,
                    durationMs: Date.now() - t0,
                  },
                });

                return JSON.stringify({
                  ok: true,
                  action,
                  toolId: tool.toolId,
                  riskLevel: toolRisk,
                  idempotencyKey: idempotencyKey || null,
                  ...result,
                });
              }

              if (action === "task.status") {
                const taskId = String(params.taskId || "").trim();
                if (!taskId)
                  return JSON.stringify({
                    ok: false,
                    error: "taskId is required",
                  });
                const result = await hubClient.taskStatus({ taskId });
                return JSON.stringify({ ok: true, action, ...result });
              }

              if (action === "task.result") {
                const taskId = String(params.taskId || "").trim();
                if (!taskId)
                  return JSON.stringify({
                    ok: false,
                    error: "taskId is required",
                  });
                const result = await hubClient.taskResult({ taskId });
                return JSON.stringify({ ok: true, action, ...result });
              }

              if (action === "file.get") {
                const fileId = String(params.fileId || "").trim();
                if (!fileId)
                  return JSON.stringify({
                    ok: false,
                    error: "fileId is required",
                  });

                const result = await hubClient.fileGet({ fileId });

                // Best-effort: if base64 provided, write to storage and create a downloadable artifact.
                const runId = this.super?.handlerProps?.runId || null;
                const threadSlug = this.super?.handlerProps?.threadSlug || null;
                let artifact = null;

                if (runId && result?.base64 && result?.filename) {
                  const root = storageRoot();
                  const dir = path.join(
                    root,
                    "runs",
                    String(runId),
                    "mcp_hub",
                    "files"
                  );
                  ensureDir(dir);
                  const safeName = String(result.filename).replace(
                    /[\\/:*?"<>|]+/g,
                    "-"
                  );
                  const absPath = path.join(
                    dir,
                    `${String(fileId)}-${safeName}`
                  );
                  const relPath = path.relative(root, absPath);
                  const buf = Buffer.from(String(result.base64), "base64");
                  fs.writeFileSync(absPath, buf);

                  artifact = await RunArtifact.create({
                    runId: String(runId),
                    artifactType: "download_file",
                    label: result.filename,
                    storageRef: relPath,
                    mimeType: result.mimeType || "application/octet-stream",
                    sizeBytes: buf.length,
                    metadata: { fileId },
                  });

                  if (threadSlug) {
                    runEventEmitter.emitForSession(
                      threadSlug,
                      SSE_EVENTS.ARTIFACT_CREATED,
                      {
                        artifactId: artifact.id,
                        runId: String(runId),
                        artifactType: artifact.artifactType,
                        label: artifact.label,
                        createdAt: artifact.createdAt,
                        metadata: safeJsonParse(artifact.metadata, {}),
                      }
                    );
                  }
                }

                return JSON.stringify({
                  ok: true,
                  action,
                  fileId,
                  filename: result?.filename || null,
                  mimeType: result?.mimeType || null,
                  artifactId: artifact?.id || null,
                });
              }

              return JSON.stringify({
                ok: false,
                error: `Unknown action: ${action}`,
              });
            } catch (error) {
              this.super?.handlerProps?.log?.(
                `[mcp_hub] ${action} failed: ${error.message || error}`
              );
              return JSON.stringify({
                ok: false,
                error: error.message || String(error),
              });
            }
          },
        });
      },
    };
  },
};

module.exports = { mcpHub };
