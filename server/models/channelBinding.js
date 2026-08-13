const { v4: uuidv4 } = require("uuid");
const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");

function normalizeProvider(provider = "") {
  return String(provider || "")
    .trim()
    .toLowerCase();
}

function normalizeJSON(input, fallback = {}) {
  if (input === null || input === undefined) return JSON.stringify(fallback);
  if (typeof input === "string") {
    const parsed = safeJsonParse(input, fallback);
    return JSON.stringify(parsed || fallback);
  }
  return JSON.stringify(input);
}

function formatBinding(binding) {
  if (!binding) return null;
  return {
    ...binding,
    match: safeJsonParse(binding.matchJson, {}),
    route: safeJsonParse(binding.routeJson, {}),
    security: safeJsonParse(binding.securityJson, {}),
  };
}

const ChannelBinding = {
  format: formatBinding,

  async get(id) {
    try {
      const record = await prisma.channel_bindings.findUnique({
        where: { id: String(id) },
      });
      return formatBinding(record);
    } catch (error) {
      console.error("[ChannelBinding] get failed:", error.message);
      return null;
    }
  },

  async list({ provider = null, accountId = null, enabled = null } = {}) {
    try {
      const where = {};
      if (provider) where.provider = normalizeProvider(provider);
      if (accountId) where.accountId = String(accountId);
      if (typeof enabled === "boolean") where.enabled = enabled;

      const records = await prisma.channel_bindings.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      return records.map(formatBinding);
    } catch (error) {
      console.error("[ChannelBinding] list failed:", error.message);
      return [];
    }
  },

  async getEnabledByAccount(provider, accountId) {
    return this.list({
      provider,
      accountId,
      enabled: true,
    });
  },

  async upsert({
    id = null,
    provider,
    accountId,
    workspaceId,
    match = {},
    route = {},
    security = {},
    priority = 0,
    enabled = true,
  }) {
    const bindingId = id ? String(id) : uuidv4();
    const normalizedProvider = normalizeProvider(provider);

    const record = await prisma.channel_bindings.upsert({
      where: { id: bindingId },
      create: {
        id: bindingId,
        provider: normalizedProvider,
        accountId: String(accountId),
        workspaceId: Number(workspaceId),
        matchJson: normalizeJSON(match, {}),
        routeJson: normalizeJSON(route, {}),
        securityJson: normalizeJSON(security, {}),
        priority: Number(priority || 0),
        enabled: enabled === false ? false : true,
      },
      update: {
        provider: normalizedProvider,
        accountId: String(accountId),
        workspaceId: Number(workspaceId),
        matchJson: normalizeJSON(match, {}),
        routeJson: normalizeJSON(route, {}),
        securityJson: normalizeJSON(security, {}),
        priority: Number(priority || 0),
        enabled: enabled === false ? false : true,
      },
    });

    return formatBinding(record);
  },

  async setEnabled(id, enabled) {
    try {
      return await prisma.channel_bindings.update({
        where: { id: String(id) },
        data: { enabled: enabled === true },
      });
    } catch (error) {
      console.error("[ChannelBinding] setEnabled failed:", error.message);
      return null;
    }
  },
};

module.exports = { ChannelBinding };
