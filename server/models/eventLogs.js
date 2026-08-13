const prisma = require("../utils/prisma");

const EventLogs = {
  logEvent: async function (event, metadata = {}, userId = null) {
    try {
      const eventLog = await prisma.event_logs.create({
        data: {
          event,
          metadata: metadata ? JSON.stringify(metadata) : null,
          userId: userId ? Number(userId) : null,
          occurredAt: new Date(),
        },
      });
      console.log(`\x1b[32m[Event Logged]\x1b[0m - ${event}`);
      return { eventLog, message: null };
    } catch (error) {
      console.error(
        `\x1b[31m[Event Logging Failed]\x1b[0m - ${event}`,
        error.message
      );
      return { eventLog: null, message: error.message };
    }
  },

  getByEvent: async function (event, limit = null, orderBy = null) {
    try {
      const logs = await prisma.event_logs.findMany({
        where: { event },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null
          ? { orderBy }
          : { orderBy: { occurredAt: "desc" } }),
      });
      return logs;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  getByUserId: async function (userId, limit = null, orderBy = null) {
    try {
      const logs = await prisma.event_logs.findMany({
        where: { userId },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null
          ? { orderBy }
          : { orderBy: { occurredAt: "desc" } }),
      });
      return logs;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    offset = null
  ) {
    try {
      const logs = await prisma.event_logs.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null
          ? { orderBy }
          : { orderBy: { occurredAt: "desc" } }),
      });
      return logs;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * 获取事件日志列表并关联用户信息
   * [性能优化] 使用批量查询替代循环中逐个查询，将 O(n) 降为 O(1) 数据库查询
   * @param {Object} clause - 查询条件
   * @param {number} limit - 限制条数
   * @param {number} offset - 偏移量
   * @param {Object} orderBy - 排序条件
   * @returns {Promise<Array>}
   */
  whereWithData: async function (
    clause = {},
    limit = null,
    offset = null,
    orderBy = null
  ) {
    const { User } = require("./user");

    try {
      const results = await this.where(clause, limit, orderBy, offset);

      // 批量获取所有相关用户 - 只需 2 次数据库查询而非 N+1 次
      const userIds = [
        ...new Set(results.map((r) => r.userId).filter(Boolean)),
      ];
      const userMap = {};

      if (userIds.length > 0) {
        const users = await User.where({ id: { in: userIds } });
        users.forEach((u) => {
          userMap[u.id] = u;
        });
      }

      for (const res of results) {
        const user = res.userId ? userMap[res.userId] : null;
        res.user = user
          ? { username: user.username }
          : { username: "unknown user" };
      }

      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.event_logs.count({
        where: clause,
      });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.event_logs.deleteMany({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { EventLogs };
