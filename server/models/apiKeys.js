const prisma = require("../utils/prisma");

const ApiKey = {
  tablename: "api_keys",
  writable: [],

  /**
   * 生成 API Key 密钥
   * @param {string} prefix - 可选前缀，如 "ak-"
   * @returns {string}
   */
  makeSecret: (prefix = "ak-") => {
    const uuidAPIKey = require("uuid-apikey");
    return `${prefix}${uuidAPIKey.create().apiKey}`;
  },

  /**
   * 创建 API Key
   * @param {number|null} createdByUserId - 创建者用户 ID
   * @param {Object} options - 可选配置
   * @returns {Promise<{apiKey: Object|null, error: string|null}>}
   */
  create: async function (createdByUserId = null, options = {}) {
    try {
      const {
        name = null,
        expiresAt = null,
        rateLimit = 100,
        permissions = null,
      } = options;

      const apiKey = await prisma.api_keys.create({
        data: {
          secret: this.makeSecret(),
          createdBy: createdByUserId,
          name,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          rateLimit,
          permissions: permissions ? JSON.stringify(permissions) : null,
        },
      });

      return { apiKey, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE API KEY.", error.message);
      return { apiKey: null, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const apiKey = await prisma.api_keys.findFirst({ where: clause });
      return apiKey;
    } catch (error) {
      console.error("FAILED TO GET API KEY.", error.message);
      return null;
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.api_keys.count({ where: clause });
      return count;
    } catch (error) {
      console.error("FAILED TO COUNT API KEYS.", error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.api_keys.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error("FAILED TO DELETE API KEY.", error.message);
      return false;
    }
  },

  where: async function (clause = {}, limit) {
    try {
      const apiKeys = await prisma.api_keys.findMany({
        where: clause,
        take: limit,
      });
      return apiKeys;
    } catch (error) {
      console.error("FAILED TO GET API KEYS.", error.message);
      return [];
    }
  },

  /**
   * 获取 API Key 列表并关联用户信息
   * [性能优化] 使用批量查询替代循环中逐个查询，将 O(n) 降为 O(1) 数据库查询
   * @param {Object} clause - 查询条件
   * @param {number} limit - 限制条数
   * @returns {Promise<Array>}
   */
  whereWithUser: async function (clause = {}, limit) {
    try {
      const { User } = require("./user");
      const apiKeys = await this.where(clause, limit);

      // 批量获取所有相关用户 - 只需 2 次数据库查询而非 N+1 次
      const userIds = [
        ...new Set(apiKeys.map((k) => k.createdBy).filter(Boolean)),
      ];
      if (userIds.length === 0) return apiKeys;

      const users = await User.where({ id: { in: userIds } });
      const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

      for (const apiKey of apiKeys) {
        if (!apiKey.createdBy) continue;
        const user = userMap[apiKey.createdBy];
        if (!user) continue;

        apiKey.createdBy = {
          id: user.id,
          username: user.username,
          role: user.role,
        };
      }

      return apiKeys;
    } catch (error) {
      console.error("FAILED TO GET API KEYS WITH USER.", error.message);
      return [];
    }
  },

  /**
   * 验证 API Key 并返回详细信息
   * @param {string} secret - API Key 密钥
   * @returns {Promise<{valid: boolean, apiKey?: Object, error?: string}>}
   */
  validate: async function (secret) {
    try {
      const apiKey = await prisma.api_keys.findFirst({
        where: { secret },
      });

      if (!apiKey) {
        return { valid: false, error: "API Key 不存在" };
      }

      if (!apiKey.isActive) {
        return { valid: false, error: "API Key 已禁用" };
      }

      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return { valid: false, error: "API Key 已过期" };
      }

      // 更新最后使用时间和使用次数
      await prisma.api_keys.update({
        where: { id: apiKey.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });

      return {
        valid: true,
        apiKey: {
          ...apiKey,
          permissions: apiKey.permissions
            ? JSON.parse(apiKey.permissions)
            : null,
        },
      };
    } catch (error) {
      console.error("FAILED TO VALIDATE API KEY.", error.message);
      return { valid: false, error: error.message };
    }
  },

  /**
   * 更新 API Key
   * @param {number} id - API Key ID
   * @param {Object} data - 更新数据
   * @returns {Promise<{apiKey: Object|null, error: string|null}>}
   */
  update: async function (id, data) {
    try {
      const updateData = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.expiresAt !== undefined)
        updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      if (data.rateLimit !== undefined) updateData.rateLimit = data.rateLimit;
      if (data.permissions !== undefined)
        updateData.permissions = data.permissions
          ? JSON.stringify(data.permissions)
          : null;

      const apiKey = await prisma.api_keys.update({
        where: { id },
        data: updateData,
      });

      return { apiKey, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE API KEY.", error.message);
      return { apiKey: null, error: error.message };
    }
  },

  /**
   * 获取用户的 API Keys
   * @param {number} userId - 用户 ID
   * @returns {Promise<Array>}
   */
  getByUser: async function (userId) {
    try {
      const apiKeys = await prisma.api_keys.findMany({
        where: { createdBy: userId },
        orderBy: { createdAt: "desc" },
      });
      return apiKeys.map((k) => ({
        ...k,
        permissions: k.permissions ? JSON.parse(k.permissions) : null,
        // 隐藏完整密钥，只显示前缀
        secretPreview: k.secret ? `${k.secret.substring(0, 10)}...` : null,
      }));
    } catch (error) {
      console.error("FAILED TO GET USER API KEYS.", error.message);
      return [];
    }
  },

  /**
   * 重新生成 API Key 密钥
   * @param {number} id - API Key ID
   * @returns {Promise<{apiKey: Object|null, error: string|null}>}
   */
  regenerate: async function (id) {
    try {
      const apiKey = await prisma.api_keys.update({
        where: { id },
        data: {
          secret: this.makeSecret(),
          lastUpdatedAt: new Date(),
        },
      });
      return { apiKey, error: null };
    } catch (error) {
      console.error("FAILED TO REGENERATE API KEY.", error.message);
      return { apiKey: null, error: error.message };
    }
  },
};

module.exports = { ApiKey };
