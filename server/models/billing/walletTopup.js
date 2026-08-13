const prisma = require("../../utils/prisma");

/**
 * @typedef {Object} WalletTopup
 * @property {number} id
 * @property {number} userId
 * @property {number} amount - 充值金额(积分)
 * @property {string} method - bank_transfer/alipay/wechat/admin_grant
 * @property {string|null} invoiceNo
 * @property {number|null} operatorId
 * @property {string|null} note
 * @property {Date} createdAt
 */

const WalletTopup = {
  /**
   * 获取用户充值记录
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @returns {Promise<{topups: WalletTopup[], total: number}>}
   */
  getByUserId: async function (userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    try {
      const [topups, total] = await Promise.all([
        prisma.wallet_topups.findMany({
          where: { userId: parseInt(userId) },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.wallet_topups.count({
          where: { userId: parseInt(userId) },
        }),
      ]);

      return { topups, total };
    } catch (error) {
      console.error("FAILED TO GET TOPUPS.", error.message);
      return { topups: [], total: 0 };
    }
  },

  /**
   * 获取所有充值记录
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @param {string} [options.method] - 筛选充值方式
   * @param {Date} [options.startDate] - 开始日期
   * @param {Date} [options.endDate] - 结束日期
   * @returns {Promise<{topups: WalletTopup[], total: number}>}
   */
  list: async function (options = {}) {
    const { page = 1, limit = 20, method, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const where = {};
    if (method) where.method = method;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    try {
      const [topups, total] = await Promise.all([
        prisma.wallet_topups.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.wallet_topups.count({ where }),
      ]);

      return { topups, total };
    } catch (error) {
      console.error("FAILED TO LIST TOPUPS.", error.message);
      return { topups: [], total: 0 };
    }
  },

  /**
   * 获取充值统计
   * @param {Object} options - 查询选项
   * @param {Date} [options.startDate] - 开始日期
   * @param {Date} [options.endDate] - 结束日期
   * @returns {Promise<{totalAmount: number, count: number, byMethod: Object}>}
   */
  getStats: async function (options = {}) {
    const { startDate, endDate } = options;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    try {
      const topups = await prisma.wallet_topups.findMany({ where });

      const totalAmount = topups.reduce((sum, t) => sum + t.amount, 0);
      const count = topups.length;

      // 按充值方式分组统计
      const byMethod = topups.reduce((acc, t) => {
        if (!acc[t.method]) {
          acc[t.method] = { count: 0, amount: 0 };
        }
        acc[t.method].count++;
        acc[t.method].amount += t.amount;
        return acc;
      }, {});

      return { totalAmount, count, byMethod };
    } catch (error) {
      console.error("FAILED TO GET TOPUP STATS.", error.message);
      return { totalAmount: 0, count: 0, byMethod: {} };
    }
  },
};

module.exports = { WalletTopup };
