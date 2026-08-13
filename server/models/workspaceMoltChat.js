const prisma = require("../utils/prisma");

function requireId(id, label = "id") {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireWorkspaceId(workspaceId) {
  return requireId(workspaceId, "workspaceId");
}

function requireMoltAgentId(moltAgentId) {
  const value = String(moltAgentId || "").trim();
  if (!value) throw new Error("moltAgentId is required");
  return value;
}

function requireScopeKey(scopeKey) {
  const value = String(scopeKey || "").trim();
  if (!value) throw new Error("scopeKey is required");
  return value;
}

function requireMoltThreadId(moltThreadId) {
  const value = String(moltThreadId || "").trim();
  if (!value) throw new Error("moltThreadId is required");
  return value;
}

function optionalUserId(createdByUserId) {
  if (
    createdByUserId === undefined ||
    createdByUserId === null ||
    createdByUserId === ""
  ) {
    return null;
  }

  return requireId(createdByUserId, "createdByUserId");
}

function compoundWhere({ workspaceId, moltAgentId, scopeKey }) {
  return {
    workspace_id_molt_agent_id_scope_key: {
      workspace_id: requireWorkspaceId(workspaceId),
      molt_agent_id: requireMoltAgentId(moltAgentId),
      scope_key: requireScopeKey(scopeKey),
    },
  };
}

const WorkspaceMoltChat = {
  async upsert(args = {}) {
    try {
      const workspace_id = requireWorkspaceId(args.workspaceId);
      const molt_agent_id = requireMoltAgentId(args.moltAgentId);
      const scope_key = requireScopeKey(args.scopeKey);
      const molt_thread_id = requireMoltThreadId(args.moltThreadId);
      const now = new Date();

      return await prisma.workspace_molt_chats.upsert({
        where: compoundWhere({
          workspaceId: workspace_id,
          moltAgentId: molt_agent_id,
          scopeKey: scope_key,
        }),
        create: {
          workspace_id,
          molt_agent_id,
          scope_key,
          created_by_user_id: optionalUserId(args.createdByUserId),
          molt_thread_id,
          status: "active",
          last_user_message_at: now,
        },
        update: {
          molt_thread_id,
          status: "active",
          last_user_message_at: now,
        },
      });
    } catch (error) {
      console.error("[WorkspaceMoltChat] upsert failed:", error.message);
      return null;
    }
  },

  async getActive(args = {}) {
    try {
      return await prisma.workspace_molt_chats.findFirst({
        where: {
          workspace_id: requireWorkspaceId(args.workspaceId),
          molt_agent_id: requireMoltAgentId(args.moltAgentId),
          scope_key: requireScopeKey(args.scopeKey),
          status: "active",
        },
      });
    } catch (error) {
      console.error("[WorkspaceMoltChat] getActive failed:", error.message);
      return null;
    }
  },

  async markStale({ id } = {}) {
    return this.setStatus({ id, status: "stale" });
  },

  async archive({ id } = {}) {
    return this.setStatus({ id, status: "archived" });
  },

  async setStatus({ id, status } = {}) {
    try {
      return await prisma.workspace_molt_chats.update({
        where: { id: requireId(id) },
        data: { status },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error("[WorkspaceMoltChat] setStatus failed:", error.message);
      return null;
    }
  },

  async bumpLastUserMessage({ id } = {}) {
    try {
      return await prisma.workspace_molt_chats.update({
        where: { id: requireId(id) },
        data: { last_user_message_at: new Date() },
      });
    } catch (error) {
      if (error?.code === "P2025") return null;
      console.error(
        "[WorkspaceMoltChat] bumpLastUserMessage failed:",
        error.message
      );
      return null;
    }
  },

  async whereWorkspace({ workspaceId } = {}) {
    try {
      return await prisma.workspace_molt_chats.findMany({
        where: {
          workspace_id: requireWorkspaceId(workspaceId),
          status: "active",
        },
        orderBy: [{ last_user_message_at: "desc" }, { updated_at: "desc" }],
      });
    } catch (error) {
      console.error(
        "[WorkspaceMoltChat] whereWorkspace failed:",
        error.message
      );
      return [];
    }
  },
};

module.exports = { WorkspaceMoltChat };
