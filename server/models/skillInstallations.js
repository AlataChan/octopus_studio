const prisma = require("../utils/prisma");

function isMissingTableError(error) {
  const msg = String(error?.message || "");
  return msg.includes("no such table") && msg.includes("skill_installations");
}

function hasSkillInstallationsModel() {
  return !!prisma?.skill_installations;
}

function normalizeScope({ assistantId = null } = {}) {
  if (assistantId === null || assistantId === undefined || assistantId === "") {
    return { scopeType: "workspace", scopeId: "__workspace__" };
  }
  return { scopeType: "assistant", scopeId: String(assistantId) };
}

const SkillInstallations = {
  async bind({ skillId, workspaceId, assistantId = null } = {}) {
    try {
      if (!hasSkillInstallationsModel()) return null;
      const { scopeType, scopeId } = normalizeScope({ assistantId });
      const where = {
        skillId_workspaceId_scopeType_scopeId: {
          skillId: String(skillId),
          workspaceId: Number(workspaceId),
          scopeType,
          scopeId,
        },
      };

      const existing = await prisma.skill_installations.findUnique({ where });
      if (existing) return existing;

      return await prisma.skill_installations.create({
        data: {
          skillId: String(skillId),
          workspaceId: Number(workspaceId),
          scopeType,
          scopeId,
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) return null;
      console.error("[SkillInstallations] bind failed:", error.message);
      return null;
    }
  },

  async unbind({ skillId, workspaceId, assistantId = null } = {}) {
    try {
      if (!hasSkillInstallationsModel()) return 0;
      const { scopeType, scopeId } = normalizeScope({ assistantId });
      const result = await prisma.skill_installations.deleteMany({
        where: {
          skillId: String(skillId),
          workspaceId: Number(workspaceId),
          scopeType,
          scopeId,
        },
      });
      return result?.count || 0;
    } catch (error) {
      if (isMissingTableError(error)) return 0;
      console.error("[SkillInstallations] unbind failed:", error.message);
      return 0;
    }
  },

  async listForWorkspace(workspaceId) {
    try {
      if (!hasSkillInstallationsModel()) return [];
      return await prisma.skill_installations.findMany({
        where: { workspaceId: Number(workspaceId) },
        orderBy: [{ createdAt: "desc" }],
      });
    } catch (error) {
      if (isMissingTableError(error)) return [];
      console.error(
        "[SkillInstallations] listForWorkspace failed:",
        error.message
      );
      return [];
    }
  },

  async listAll() {
    try {
      if (!hasSkillInstallationsModel()) return [];
      return await prisma.skill_installations.findMany({
        orderBy: [{ createdAt: "desc" }],
      });
    } catch (error) {
      if (isMissingTableError(error)) return [];
      console.error("[SkillInstallations] listAll failed:", error.message);
      return [];
    }
  },

  async listWorkspaceIdsForSkill(skillId) {
    try {
      if (!hasSkillInstallationsModel()) return [];
      const rows = await prisma.skill_installations.findMany({
        where: { skillId: String(skillId) },
        select: { workspaceId: true },
        distinct: ["workspaceId"],
      });
      return (rows || [])
        .map((r) => Number(r.workspaceId))
        .filter(Number.isFinite);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      console.error(
        "[SkillInstallations] listWorkspaceIdsForSkill failed:",
        error.message
      );
      return [];
    }
  },

  async removeSkillEverywhere(skillId) {
    try {
      if (!hasSkillInstallationsModel()) return 0;
      const result = await prisma.skill_installations.deleteMany({
        where: { skillId: String(skillId) },
      });
      return result?.count || 0;
    } catch (error) {
      if (isMissingTableError(error)) return 0;
      console.error(
        "[SkillInstallations] removeSkillEverywhere failed:",
        error.message
      );
      return 0;
    }
  },
};

module.exports = { SkillInstallations };
