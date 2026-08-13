function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
    .join(",")}}`;
}

function idempotencyKeyFor({ orchestrationRunId, stepId, toolName, toolArgs }) {
  return `${orchestrationRunId}:${stepId}:${toolName}:${stableStringify(
    toolArgs || {}
  )}`;
}

// 默认持久 store(包 WorkflowPendingConfirmation + 按 runId 查)
function defaultConfirmationStore() {
  const { WorkflowPendingConfirmation } = require("../../../models/workflowPendingConfirmation");
  const prisma = require("../../prisma");
  return {
    async create(args) {
      return WorkflowPendingConfirmation.create(args);
    },
    async findByIdempotencyKey(orchestrationRunId, idempotencyKey) {
      const rows = await prisma.workflow_pending_confirmations.findMany({
        where: { runId: String(orchestrationRunId) },
      });
      for (const r of rows) {
        let pd = {};
        try {
          pd = JSON.parse(r.planDetails || "{}");
        } catch (_) {}
        if (pd.idempotencyKey === idempotencyKey) return r;
      }
      return null;
    },
  };
}

/**
 * 绑定编排上下文的审批委托。每个编排步构造一个(stepId=步序)。
 * @param {{ orchestrationRunId, stepId, workspaceId, userId?, threadId?, onEvent?, store?, timeoutMinutes? }} ctx
 */
function createApprovalBroker(ctx = {}) {
  const store = ctx.store || defaultConfirmationStore();
  return {
    async requestApproval({
      toolName,
      toolArgs,
      reason,
      riskLevel = "medium",
      childRunId = null,
    }) {
      const idempotencyKey = idempotencyKeyFor({
        orchestrationRunId: ctx.orchestrationRunId,
        stepId: ctx.stepId,
        toolName,
        toolArgs,
      });
      const existing = await store.findByIdempotencyKey(
        ctx.orchestrationRunId,
        idempotencyKey
      );
      if (existing) {
        if (existing.status === "approved")
          return {
            decision: "approved",
            userResponse: existing.userResponse || null,
          };
        if (existing.status === "rejected")
          return {
            decision: "rejected",
            userResponse: existing.userResponse || null,
          };
        return { decision: "suspend", confirmationId: existing.id }; // 仍 pending
      }
      const conf = await store.create({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId ?? null,
        threadId: ctx.threadId ?? null,
        planType: "tool_call",
        planTitle: `团队步骤审批：${toolName}`,
        planDetails: {
          kind: "team_step",
          orchestrationRunId: ctx.orchestrationRunId,
          stepId: ctx.stepId,
          childRunId,
          toolName,
          reason: reason || null,
          idempotencyKey,
        },
        riskLevel,
        runId: ctx.orchestrationRunId,
        timeoutMinutes: ctx.timeoutMinutes ?? 1440,
      });
      if (typeof ctx.onEvent === "function") {
        try {
          ctx.onEvent({
            type: "approvalRequested",
            confirmationId: conf.id,
            childRunId,
            stepId: ctx.stepId,
            toolName,
            riskLevel,
          });
        } catch (_) {}
      }
      return { decision: "suspend", confirmationId: conf.id };
    },
  };
}

module.exports = {
  createApprovalBroker,
  idempotencyKeyFor,
  stableStringify,
  defaultConfirmationStore,
};
