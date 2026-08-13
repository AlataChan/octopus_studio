const prisma = require("../utils/prisma");

function requireValue(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`${label} is required`);
  }
  return String(value);
}

function compoundWhere({ workspaceId, platform, externalAppId, scopeKey }) {
  return {
    workspace_id_platform_external_app_id_scope_key: {
      workspace_id: Number(workspaceId),
      platform: requireValue(platform, "platform"),
      external_app_id: requireValue(externalAppId, "externalAppId"),
      scope_key: requireValue(scopeKey, "scopeKey"),
    },
  };
}

function stripUndefined(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function expiryFromTtl(now, ttlMs) {
  if (!ttlMs) return null;
  const ttl = Number(ttlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) return null;
  return new Date(now.getTime() + ttl);
}

const ExternalThreadState = {
  get: async function ({ workspaceId, platform, externalAppId, scopeKey }) {
    const row = await prisma.external_thread_state.findUnique({
      where: compoundWhere({ workspaceId, platform, externalAppId, scopeKey }),
    });

    if (!row) return null;
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return null;
    return row;
  },

  upsert: async function ({
    workspaceId,
    platform,
    externalAppId,
    scopeKey,
    externalConversationId,
    externalSessionId,
    ttlMs = null,
  }) {
    const now = new Date();
    const expiresAt = expiryFromTtl(now, ttlMs);
    const where = compoundWhere({
      workspaceId,
      platform,
      externalAppId,
      scopeKey,
    });
    const update = stripUndefined({
      external_conversation_id: externalConversationId,
      external_session_id: externalSessionId,
      last_used_at: now,
      expires_at: expiresAt,
    });

    return prisma.external_thread_state.upsert({
      where,
      update,
      create: {
        workspace_id: Number(workspaceId),
        platform: requireValue(platform, "platform"),
        external_app_id: requireValue(externalAppId, "externalAppId"),
        scope_key: requireValue(scopeKey, "scopeKey"),
        external_conversation_id: externalConversationId || null,
        external_session_id: externalSessionId || null,
        last_used_at: now,
        expires_at: expiresAt,
      },
    });
  },

  delete: async function ({ workspaceId, platform, externalAppId, scopeKey }) {
    const workspace_id = Number(workspaceId);
    if (!Number.isFinite(workspace_id)) return false;

    if (platform === "*" || externalAppId === "*") {
      const where = stripUndefined({
        workspace_id,
        scope_key: requireValue(scopeKey, "scopeKey"),
        platform:
          platform === "*" ? undefined : requireValue(platform, "platform"),
        external_app_id:
          externalAppId === "*"
            ? undefined
            : requireValue(externalAppId, "externalAppId"),
      });
      const result = await prisma.external_thread_state.deleteMany({ where });
      return result.count > 0;
    }

    try {
      await prisma.external_thread_state.delete({
        where: compoundWhere({
          workspaceId,
          platform,
          externalAppId,
          scopeKey,
        }),
      });
      return true;
    } catch (error) {
      if (error?.code === "P2025") return false;
      throw error;
    }
  },

  deleteByScopeKey: async function ({ workspaceId, scopeKey }) {
    const result = await prisma.external_thread_state.deleteMany({
      where: {
        workspace_id: Number(workspaceId),
        scope_key: requireValue(scopeKey, "scopeKey"),
      },
    });
    return result.count;
  },

  deleteByWorkspace: async function (workspaceId) {
    const result = await prisma.external_thread_state.deleteMany({
      where: { workspace_id: Number(workspaceId) },
    });
    return result.count;
  },
};

module.exports = { ExternalThreadState };
