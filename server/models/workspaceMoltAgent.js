const prisma = require("../utils/prisma");

function requireWorkspaceId(workspaceId) {
  const value = Number(workspaceId);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("workspaceId is required");
  }
  return value;
}

function requireMoltAgentId(moltAgentId) {
  const value = String(moltAgentId || "").trim();
  if (!value) throw new Error("moltAgentId is required");
  return value;
}

function compoundWhere({ workspaceId, moltAgentId }) {
  return {
    workspace_id_molt_agent_id: {
      workspace_id: requireWorkspaceId(workspaceId),
      molt_agent_id: requireMoltAgentId(moltAgentId),
    },
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function serializeMetadata(metadata) {
  if (metadata === undefined || metadata === null || metadata === "")
    return null;
  if (typeof metadata === "string") return metadata;
  return JSON.stringify(metadata);
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mergeMetadata(existing, patch = {}) {
  return JSON.stringify({ ...parseMetadata(existing), ...patch });
}

function isOrphaned(row = {}) {
  return parseMetadata(row.metadata).moltStatus === "orphaned";
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function stripUndefined(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

const WorkspaceMoltAgent = {
  async attach(args = {}) {
    try {
      const workspace_id = requireWorkspaceId(args.workspaceId);
      const molt_agent_id = requireMoltAgentId(args.moltAgentId);
      const hasDisplayName = hasOwn(args, "displayName");
      const hasMetadata = hasOwn(args, "metadata");
      const update = stripUndefined({
        display_name: hasDisplayName
          ? optionalString(args.displayName)
          : undefined,
        metadata: hasMetadata ? serializeMetadata(args.metadata) : undefined,
      });

      return await prisma.workspace_molt_agents.upsert({
        where: compoundWhere({
          workspaceId: workspace_id,
          moltAgentId: molt_agent_id,
        }),
        create: {
          workspace_id,
          molt_agent_id,
          display_name: hasDisplayName
            ? optionalString(args.displayName)
            : null,
          metadata: hasMetadata ? serializeMetadata(args.metadata) : null,
          deletedAt: null,
        },
        update: { ...update, deletedAt: null },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        return this.get({
          workspaceId: args.workspaceId,
          moltAgentId: args.moltAgentId,
        });
      }
      console.error("[WorkspaceMoltAgent] attach failed:", error.message);
      return null;
    }
  },

  async where({
    workspaceId,
    enabledOnly = false,
    includeSoftDeleted = false,
  } = {}) {
    try {
      const where = { workspace_id: requireWorkspaceId(workspaceId) };
      if (enabledOnly) where.enabled = true;
      if (!includeSoftDeleted) where.deletedAt = null;

      return await prisma.workspace_molt_agents.findMany({
        where,
        orderBy: [{ enabled: "desc" }, { created_at: "asc" }],
      });
    } catch (error) {
      console.error("[WorkspaceMoltAgent] where failed:", error.message);
      return [];
    }
  },

  async all({ includeSoftDeleted = false } = {}) {
    try {
      const where = includeSoftDeleted ? {} : { deletedAt: null };
      return await prisma.workspace_molt_agents.findMany({
        where,
        orderBy: [{ workspace_id: "asc" }, { created_at: "asc" }],
      });
    } catch (error) {
      console.error("[WorkspaceMoltAgent] all failed:", error.message);
      return [];
    }
  },

  async get({ workspaceId, moltAgentId, includeSoftDeleted = false } = {}) {
    try {
      const row = await prisma.workspace_molt_agents.findUnique({
        where: compoundWhere({ workspaceId, moltAgentId }),
      });
      if (!includeSoftDeleted && row?.deletedAt) return null;
      return row;
    } catch (error) {
      console.error("[WorkspaceMoltAgent] get failed:", error.message);
      return null;
    }
  },

  async disable({ workspaceId, moltAgentId } = {}) {
    return this.setEnabled({ workspaceId, moltAgentId, enabled: false });
  },

  async enable({ workspaceId, moltAgentId } = {}) {
    return this.setEnabled({ workspaceId, moltAgentId, enabled: true });
  },

  async setEnabled({ workspaceId, moltAgentId, enabled } = {}) {
    try {
      return await prisma.workspace_molt_agents.update({
        where: compoundWhere({ workspaceId, moltAgentId }),
        data: {
          enabled: Boolean(enabled),
          ...(enabled ? { deletedAt: null } : {}),
        },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error("[WorkspaceMoltAgent] setEnabled failed:", error.message);
      return null;
    }
  },

  async remove({ workspaceId, moltAgentId } = {}) {
    try {
      await prisma.workspace_molt_agents.delete({
        where: compoundWhere({ workspaceId, moltAgentId }),
      });
      return true;
    } catch (error) {
      if (error?.code === "P2025") return false;
      console.error("[WorkspaceMoltAgent] remove failed:", error.message);
      return false;
    }
  },

  async markOrphaned({ workspaceId, moltAgentId } = {}) {
    try {
      const existing = await this.get({
        workspaceId,
        moltAgentId,
        includeSoftDeleted: true,
      });
      if (!existing) return null;

      return await prisma.workspace_molt_agents.update({
        where: compoundWhere({ workspaceId, moltAgentId }),
        data: {
          enabled: false,
          lastSeenAt: new Date(),
          metadata: mergeMetadata(existing.metadata, {
            moltStatus: "orphaned",
          }),
        },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error("[WorkspaceMoltAgent] markOrphaned failed:", error.message);
      return null;
    }
  },

  async markReattached({ workspaceId, moltAgentId } = {}) {
    try {
      const existing = await this.get({
        workspaceId,
        moltAgentId,
        includeSoftDeleted: true,
      });
      if (!existing) return null;

      return await prisma.workspace_molt_agents.update({
        where: compoundWhere({ workspaceId, moltAgentId }),
        data: {
          enabled: true,
          deletedAt: null,
          lastSeenAt: new Date(),
          metadata: mergeMetadata(existing.metadata, {
            moltStatus: "active",
          }),
        },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error(
        "[WorkspaceMoltAgent] markReattached failed:",
        error.message
      );
      return null;
    }
  },

  async softDelete({ id } = {}) {
    try {
      return await prisma.workspace_molt_agents.update({
        where: { id: Number(id) },
        data: {
          enabled: false,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error("[WorkspaceMoltAgent] softDelete failed:", error.message);
      return null;
    }
  },

  async listOrphanedOlderThan({ ageDays = 30 } = {}) {
    try {
      const safeAgeDays = Number.isFinite(Number(ageDays))
        ? Number(ageDays)
        : 30;
      const cutoff = new Date(
        Date.now() - Math.max(1, safeAgeDays) * 24 * 60 * 60 * 1000
      );
      return await prisma.workspace_molt_agents.findMany({
        where: {
          enabled: false,
          deletedAt: null,
          lastSeenAt: { lt: cutoff },
          metadata: { contains: '"moltStatus":"orphaned"' },
        },
        orderBy: [{ lastSeenAt: "asc" }],
      });
    } catch (error) {
      console.error(
        "[WorkspaceMoltAgent] listOrphanedOlderThan failed:",
        error.message
      );
      return [];
    }
  },

  isOrphaned,
};

module.exports = { WorkspaceMoltAgent };
