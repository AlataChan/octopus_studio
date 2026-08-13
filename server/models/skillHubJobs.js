const prisma = require("../utils/prisma");

function isMissingTableError(error) {
  const msg = String(error?.message || "");
  return msg.includes("no such table") && msg.includes("skill_hub_jobs");
}

function hasJobsModel() {
  return !!prisma?.skill_hub_jobs;
}

function safeJsonStringify(value) {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      error: "Failed to stringify result",
      message: error.message,
    });
  }
}

const SkillHubJobs = {
  Status: {
    PENDING: "pending",
    RUNNING: "running",
    DONE: "done",
    FAILED: "failed",
    BLOCKED: "blocked",
  },

  async start({
    type,
    status = "running",
    skillId = null,
    workspaceId = null,
    scopeType = null,
    scopeId = null,
    result = null,
    error = null,
  } = {}) {
    try {
      if (!hasJobsModel()) return null;
      if (!type) throw new Error("Job type is required");
      return await prisma.skill_hub_jobs.create({
        data: {
          id: cryptoRandomUUID(),
          type: String(type),
          status: String(status),
          skillId: skillId ? String(skillId) : null,
          workspaceId:
            workspaceId !== null && workspaceId !== undefined
              ? Number(workspaceId)
              : null,
          scopeType: scopeType ? String(scopeType) : null,
          scopeId: scopeId ? String(scopeId) : null,
          resultJson: safeJsonStringify(result),
          error: error ? String(error) : null,
        },
      });
    } catch (err) {
      if (isMissingTableError(err)) return null;
      console.error("[SkillHubJobs] start failed:", err.message);
      return null;
    }
  },

  async finish(jobId, { status, result = undefined, error = undefined } = {}) {
    try {
      if (!hasJobsModel()) return null;
      if (!jobId) return null;

      const data = {
        ...(status ? { status: String(status) } : {}),
        finishedAt: new Date(),
      };
      if (result !== undefined) data.resultJson = safeJsonStringify(result);
      if (error !== undefined) data.error = error ? String(error) : null;

      return await prisma.skill_hub_jobs.update({
        where: { id: String(jobId) },
        data,
      });
    } catch (err) {
      if (isMissingTableError(err)) return null;
      console.error("[SkillHubJobs] finish failed:", err.message);
      return null;
    }
  },

  async update(jobId, patch = {}) {
    try {
      if (!hasJobsModel()) return null;
      if (!jobId) return null;

      const data = {};
      if (patch.type) data.type = String(patch.type);
      if (patch.status) data.status = String(patch.status);
      if (patch.skillId !== undefined)
        data.skillId = patch.skillId ? String(patch.skillId) : null;
      if (patch.workspaceId !== undefined)
        data.workspaceId =
          patch.workspaceId === null ? null : Number(patch.workspaceId);
      if (patch.scopeType !== undefined)
        data.scopeType = patch.scopeType ? String(patch.scopeType) : null;
      if (patch.scopeId !== undefined)
        data.scopeId = patch.scopeId ? String(patch.scopeId) : null;
      if (patch.startedAt) data.startedAt = new Date(patch.startedAt);
      if (patch.finishedAt !== undefined)
        data.finishedAt = patch.finishedAt ? new Date(patch.finishedAt) : null;
      if (patch.result !== undefined)
        data.resultJson = safeJsonStringify(patch.result);
      if (patch.error !== undefined)
        data.error = patch.error ? String(patch.error) : null;

      return await prisma.skill_hub_jobs.update({
        where: { id: String(jobId) },
        data,
      });
    } catch (err) {
      if (isMissingTableError(err)) return null;
      console.error("[SkillHubJobs] update failed:", err.message);
      return null;
    }
  },

  async get(jobId) {
    try {
      if (!hasJobsModel()) return null;
      if (!jobId) return null;
      return await prisma.skill_hub_jobs.findUnique({
        where: { id: String(jobId) },
      });
    } catch (err) {
      if (isMissingTableError(err)) return null;
      console.error("[SkillHubJobs] get failed:", err.message);
      return null;
    }
  },

  async list({
    workspaceId = undefined,
    status = undefined,
    type = undefined,
    skillId = undefined,
    scopeType = undefined,
    scopeId = undefined,
    limit = 50,
    offset = 0,
  } = {}) {
    try {
      if (!hasJobsModel()) return [];
      const where = {};
      if (workspaceId !== undefined) where.workspaceId = Number(workspaceId);
      if (status) where.status = String(status);
      if (type) where.type = String(type);
      if (skillId) where.skillId = String(skillId);
      if (scopeType) where.scopeType = String(scopeType);
      if (scopeId) where.scopeId = String(scopeId);

      return await prisma.skill_hub_jobs.findMany({
        where,
        take: Math.min(Math.max(Number(limit) || 50, 1), 200),
        skip: Math.max(Number(offset) || 0, 0),
        orderBy: [{ createdAt: "desc" }],
      });
    } catch (err) {
      if (isMissingTableError(err)) return [];
      console.error("[SkillHubJobs] list failed:", err.message);
      return [];
    }
  },

  async listByTypes(types = [], { limit = 50, offset = 0 } = {}) {
    try {
      if (!hasJobsModel()) return [];
      const list = Array.isArray(types)
        ? types.map((t) => String(t || "").trim()).filter(Boolean)
        : [];
      if (list.length === 0) return [];

      return await prisma.skill_hub_jobs.findMany({
        where: { type: { in: list } },
        take: Math.min(Math.max(Number(limit) || 50, 1), 200),
        skip: Math.max(Number(offset) || 0, 0),
        orderBy: [{ createdAt: "desc" }],
      });
    } catch (err) {
      if (isMissingTableError(err)) return [];
      console.error("[SkillHubJobs] listByTypes failed:", err.message);
      return [];
    }
  },
};

function cryptoRandomUUID() {
  try {
    return require("crypto").randomUUID();
  } catch {
    // Fallback for very old Node versions (should not happen in this repo)
    return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

module.exports = { SkillHubJobs };
