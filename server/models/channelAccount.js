const prisma = require("../utils/prisma");
const { EncryptionManager } = require("../utils/EncryptionManager");
const { safeJsonParse } = require("../utils/http");

const encryption = new EncryptionManager();

function normalizeProvider(provider = "") {
  return String(provider || "")
    .trim()
    .toLowerCase();
}

const ChannelAccount = {
  async get({ provider, accountId }) {
    try {
      return await prisma.channel_accounts.findUnique({
        where: {
          provider_accountId: {
            provider: normalizeProvider(provider),
            accountId: String(accountId),
          },
        },
      });
    } catch (error) {
      console.error("[ChannelAccount] get failed:", error.message);
      return null;
    }
  },

  async list({ provider = null, status = null } = {}) {
    try {
      const where = {};
      if (provider) where.provider = normalizeProvider(provider);
      if (status) where.status = String(status);
      return await prisma.channel_accounts.findMany({
        where,
        orderBy: [{ provider: "asc" }, { accountId: "asc" }],
      });
    } catch (error) {
      console.error("[ChannelAccount] list failed:", error.message);
      return [];
    }
  },

  async upsert({
    provider,
    accountId,
    secrets = {},
    status = "active",
    tokenExpiresAt = null,
  }) {
    const normalizedProvider = normalizeProvider(provider);
    const encryptedSecrets = encryption.encrypt(JSON.stringify(secrets || {}));

    if (!encryptedSecrets) {
      throw new Error("Failed to encrypt channel account secrets");
    }

    return prisma.channel_accounts.upsert({
      where: {
        provider_accountId: {
          provider: normalizedProvider,
          accountId: String(accountId),
        },
      },
      create: {
        provider: normalizedProvider,
        accountId: String(accountId),
        encryptedSecrets,
        status: String(status || "active"),
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
      },
      update: {
        encryptedSecrets,
        status: String(status || "active"),
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
      },
    });
  },

  parseSecrets(account = null) {
    if (!account?.encryptedSecrets) return {};
    const decrypted = encryption.decrypt(account.encryptedSecrets);
    return safeJsonParse(decrypted, {}) || {};
  },

  toPublic(account = null) {
    if (!account) return null;
    return {
      id: account.id,
      provider: account.provider,
      accountId: account.accountId,
      status: account.status,
      tokenExpiresAt: account.tokenExpiresAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  },
};

module.exports = { ChannelAccount };
