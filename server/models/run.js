const prisma = require("../utils/prisma");
const { redactFdeText, redactFdeValue } = require("../utils/fde/redaction");

const Run = {
  STATUS: {
    QUEUED: "queued",
    RUNNING: "running",
    BLOCKED: "blocked",
    SUCCEEDED: "succeeded",
    FAILED: "failed",
    CANCELLED: "cancelled",
  },

  TRIGGER: {
    UI: "ui",
    IM: "im",
    CRON: "cron",
    WEBHOOK: "webhook",
    MANUAL: "manual",
  },

  ERROR_CODE: {
    BROWSER_POLICY_BLOCKED: "browser.policy_blocked",
    BROWSER_NAV_FAILED: "browser.nav_failed",
    BROWSER_ELEMENT_NOT_FOUND: "browser.element_not_found",
    BROWSER_TIMEOUT: "browser.timeout",
    BROWSER_UPLOAD_DENIED: "browser.upload_denied",
    HITL_REJECTED: "hitl.rejected",
    HITL_EXPIRED: "hitl.expired",
    TOOL_RATE_LIMITED: "tool.rate_limited",
    TOOL_PERMISSION_DENIED: "tool.permission_denied",
    LLM_CONTEXT_OVERFLOW: "llm.context_overflow",
    RUN_CANCELLED: "run.cancelled",
    RUN_UNKNOWN: "run.unknown",
  },

  isNotRetryable(errorCode) {
    const notRetryable = new Set([
      Run.ERROR_CODE.BROWSER_POLICY_BLOCKED,
      Run.ERROR_CODE.BROWSER_ELEMENT_NOT_FOUND,
      Run.ERROR_CODE.BROWSER_UPLOAD_DENIED,
      Run.ERROR_CODE.HITL_REJECTED,
      Run.ERROR_CODE.TOOL_PERMISSION_DENIED,
      Run.ERROR_CODE.RUN_CANCELLED,
      Run.ERROR_CODE.RUN_UNKNOWN,
    ]);
    return notRetryable.has(errorCode);
  },

  async create({
    threadId,
    workspaceId,
    triggerType,
    engine,
    triggerId = null,
    metadata = {},
    fdeWorkflowDraftId = null,
  }) {
    if (typeof engine !== "string" || !engine.trim()) {
      const error = new Error("run engine must be supplied explicitly");
      error.code = "RUN_ENGINE_REQUIRED";
      throw error;
    }
    const numericWorkspaceId = parseInt(workspaceId);
    return prisma.runs.create({
      data: {
        threadId: threadId == null ? "" : String(threadId),
        workspace: { connect: { id: numericWorkspaceId } },
        triggerType,
        triggerId,
        status: Run.STATUS.QUEUED,
        engine: engine.trim(),
        metadata: JSON.stringify(redactFdeValue(metadata, { maxDepth: 64 })),
        ...(fdeWorkflowDraftId
          ? {
              fdeWorkflowDraft: { connect: { id: String(fdeWorkflowDraftId) } },
            }
          : {}),
      },
    });
  },

  async updateStatus(runId, status, extra = {}) {
    const data = { status, updatedAt: new Date() };
    if (status === Run.STATUS.RUNNING && !extra.startedAt)
      data.startedAt = new Date();
    if (
      [Run.STATUS.SUCCEEDED, Run.STATUS.FAILED, Run.STATUS.CANCELLED].includes(
        status
      )
    ) {
      data.completedAt = new Date();
    }
    if (extra.errorCode) data.errorCode = extra.errorCode;
    if (extra.errorDetail) data.errorDetail = redactFdeText(extra.errorDetail);
    if (extra.surfaceId) data.surfaceId = extra.surfaceId;
    return prisma.runs.update({ where: { id: runId }, data });
  },

  async getById(runId) {
    return prisma.runs.findUnique({ where: { id: runId } });
  },

  async listByThread(threadId, { limit = 20, status = null } = {}) {
    return prisma.runs.findMany({
      where: { threadId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async listByWorkspace(workspaceId, { limit = 50, status = null } = {}) {
    return prisma.runs.findMany({
      where: {
        workspaceId: parseInt(workspaceId),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { artifacts: true },
    });
  },

  async countActive() {
    return prisma.runs.count({
      where: {
        status: {
          in: [Run.STATUS.QUEUED, Run.STATUS.RUNNING, Run.STATUS.BLOCKED],
        },
      },
    });
  },
};

module.exports = { Run };
