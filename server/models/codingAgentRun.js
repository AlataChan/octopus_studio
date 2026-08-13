const prisma = require("../utils/prisma");

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function stringifyJson(value) {
  return JSON.stringify(value || {});
}

function formatRun(run) {
  if (!run) return null;
  return {
    ...run,
    metadata: parseJson(run.metadata),
  };
}

function pickRunData(input = {}) {
  const allowed = new Set([
    "userId",
    "workspaceId",
    "sourceRepoPath",
    "sandboxPath",
    "status",
    "provider",
    "model",
    "maxTurns",
    "totalTurns",
    "totalCostUsd",
    "errorCode",
    "errorDetail",
    "appliedAt",
    "metadata",
    "createdAt",
    "updatedAt",
    "completedAt",
  ]);
  const data = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => allowed.has(key) && value !== undefined)
  );
  for (const key of ["createdAt", "updatedAt", "completedAt", "appliedAt"]) {
    if (data[key] != null && !(data[key] instanceof Date)) {
      data[key] = new Date(data[key]);
    }
  }
  return data;
}

const CodingAgentRun = {
  STATUS: {
    PENDING: "pending",
    RUNNING: "running",
    AWAITING_APPROVAL: "awaiting_approval",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    FAILED: "failed",
    EXPIRED: "expired",
  },

  async create({
    id,
    userId = null,
    workspaceId = null,
    sourceRepoPath,
    sandboxPath = null,
    status = "pending",
    provider = "fake",
    model = null,
    maxTurns = 20,
    totalTurns = 0,
    totalCostUsd = 0,
    errorCode = null,
    errorDetail = null,
    metadata = {},
  }) {
    const run = await prisma.coding_agent_runs.create({
      data: {
        id,
        userId,
        workspaceId,
        sourceRepoPath,
        sandboxPath,
        status,
        provider,
        model,
        maxTurns,
        totalTurns,
        totalCostUsd,
        errorCode,
        errorDetail,
        metadata: stringifyJson(metadata),
      },
    });
    return formatRun(run);
  },

  async updateStatus(runId, status, extra = {}) {
    const data = {
      status,
      updatedAt: new Date(),
      ...(extra.totalTurns != null ? { totalTurns: extra.totalTurns } : {}),
      ...(extra.totalCostUsd != null ? { totalCostUsd: extra.totalCostUsd } : {}),
      ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
      ...(extra.errorDetail ? { errorDetail: extra.errorDetail } : {}),
      ...(extra.metadata ? { metadata: stringifyJson(extra.metadata) } : {}),
      ...(extra.sandboxPath !== undefined ? { sandboxPath: extra.sandboxPath } : {}),
      ...(extra.appliedAt !== undefined ? { appliedAt: extra.appliedAt } : {}),
    };
    if (["completed", "cancelled", "failed", "expired"].includes(status)) {
      data.completedAt = extra.completedAt || new Date();
    }
    const run = await prisma.coding_agent_runs.update({
      where: { id: runId },
      data,
    });
    return formatRun(run);
  },

  async update(runId, patch = {}) {
    const data = { ...pickRunData(patch), updatedAt: new Date() };
    if (patch.metadata) data.metadata = stringifyJson(patch.metadata);
    const run = await prisma.coding_agent_runs.update({
      where: { id: runId },
      data,
    });
    return formatRun(run);
  },

  async getById(runId) {
    return formatRun(
      await prisma.coding_agent_runs.findUnique({ where: { id: runId } })
    );
  },

  async listNonTerminal() {
    const runs = await prisma.coding_agent_runs.findMany({
      where: { status: { in: ["pending", "running", "awaiting_approval"] } },
      orderBy: { createdAt: "asc" },
    });
    return runs.map(formatRun);
  },

  async getBySandboxPath(sandboxPath) {
    return formatRun(
      await prisma.coding_agent_runs.findFirst({ where: { sandboxPath } })
    );
  },

  _formatRun: formatRun,
};

module.exports = {
  CodingAgentRun,
};
