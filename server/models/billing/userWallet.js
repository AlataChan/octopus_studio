const prisma = require("../../utils/prisma");

/**
 * @typedef {Object} UserWallet
 * @property {number} id
 * @property {number} userId
 * @property {number} balance - 积分余额 (1积分 = ¥0.001)
 * @property {string} plan - free/starter/pro/enterprise
 * @property {number|null} alertThreshold - 余额预警阈值(积分)
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

const UserWallet = {
  /**
   * 获取用户钱包，如果不存在则创建
   * @param {number} userId - 用户ID
   * @returns {Promise<UserWallet>}
   */
  getOrCreate: async function (userId) {
    try {
      let wallet = await prisma.user_wallets.findUnique({
        where: { userId: parseInt(userId) },
      });

      if (!wallet) {
        wallet = await prisma.user_wallets.create({
          data: { userId: parseInt(userId) },
        });
      }

      return wallet;
    } catch (error) {
      console.error("FAILED TO GET OR CREATE WALLET.", error.message);
      return null;
    }
  },

  /**
   * 获取用户钱包
   * @param {number} userId - 用户ID
   * @returns {Promise<UserWallet|null>}
   */
  get: async function (userId) {
    try {
      const wallet = await prisma.user_wallets.findUnique({
        where: { userId: parseInt(userId) },
      });
      return wallet;
    } catch (error) {
      console.error("FAILED TO GET WALLET.", error.message);
      return null;
    }
  },

  /**
   * 充值操作
   * @param {number} userId - 目标用户ID
   * @param {number} amount - 充值金额(积分)
   * @param {Object} options - 充值选项
   * @param {string} options.method - 充值方式
   * @param {number} [options.operatorId] - 操作人ID
   * @param {string} [options.invoiceNo] - 发票号
   * @param {string} [options.note] - 备注
   * @returns {Promise<{success: boolean, wallet?: UserWallet, topup?: Object, error?: string}>}
   */
  topup: async function (userId, amount, options = {}) {
    const {
      method = "admin_grant",
      operatorId = null,
      invoiceNo = null,
      note = null,
    } = options;

    if (!amount || amount <= 0) {
      return { success: false, error: "充值金额必须大于0" };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 获取或创建钱包
        let wallet = await tx.user_wallets.findUnique({
          where: { userId: parseInt(userId) },
        });

        if (!wallet) {
          wallet = await tx.user_wallets.create({
            data: { userId: parseInt(userId) },
          });
        }

        // 更新余额
        const updatedWallet = await tx.user_wallets.update({
          where: { userId: parseInt(userId) },
          data: { balance: wallet.balance + parseInt(amount) },
        });

        // 记录充值记录
        const topup = await tx.wallet_topups.create({
          data: {
            userId: parseInt(userId),
            amount: parseInt(amount),
            method,
            operatorId: operatorId ? parseInt(operatorId) : null,
            invoiceNo,
            note,
          },
        });

        return { wallet: updatedWallet, topup };
      });

      return { success: true, ...result };
    } catch (error) {
      console.error("FAILED TO TOPUP.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 扣费操作
   * @param {number} userId - 用户ID
   * @param {number} amount - 扣费金额(积分)
   * @returns {Promise<{success: boolean, wallet?: UserWallet, error?: string}>}
   */
  deduct: async function (userId, amount) {
    if (!amount || amount <= 0) {
      return { success: false, error: "扣费金额必须大于0" };
    }

    try {
      const wallet = await prisma.user_wallets.findUnique({
        where: { userId: parseInt(userId) },
      });

      if (!wallet) {
        return { success: false, error: "用户钱包不存在" };
      }

      if (wallet.balance < amount) {
        return { success: false, error: "余额不足" };
      }

      const updatedWallet = await prisma.user_wallets.update({
        where: { userId: parseInt(userId) },
        data: { balance: wallet.balance - parseInt(amount) },
      });

      return { success: true, wallet: updatedWallet };
    } catch (error) {
      console.error("FAILED TO DEDUCT.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 检查余额是否充足
   * @param {number} userId - 用户ID
   * @param {number} requiredAmount - 所需金额(积分)
   * @returns {Promise<{sufficient: boolean, balance: number, shortfall: number}>}
   */
  checkBalance: async function (userId, requiredAmount = 0) {
    const wallet = await this.getOrCreate(userId);
    const balance = wallet?.balance || 0;
    const sufficient = balance >= requiredAmount;
    const shortfall = sufficient ? 0 : requiredAmount - balance;

    return { sufficient, balance, shortfall };
  },

  /**
   * 更新套餐
   * @param {number} userId - 用户ID
   * @param {string} plan - 套餐类型
   * @returns {Promise<{success: boolean, wallet?: UserWallet, error?: string}>}
   */
  updatePlan: async function (userId, plan) {
    const validPlans = ["free", "starter", "pro", "enterprise"];
    if (!validPlans.includes(plan)) {
      return { success: false, error: `无效的套餐类型: ${plan}` };
    }

    try {
      await this.getOrCreate(userId);
      const wallet = await prisma.user_wallets.update({
        where: { userId: parseInt(userId) },
        data: { plan },
      });
      return { success: true, wallet };
    } catch (error) {
      console.error("FAILED TO UPDATE PLAN.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取所有用户钱包列表
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @returns {Promise<{wallets: UserWallet[], total: number}>}
   */
  list: async function (options = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    try {
      const [users, total] = await Promise.all([
        prisma.users.findMany({
          skip,
          take: limit,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            username: true,
            role: true,
            createdAt: true,
            lastUpdatedAt: true,
          },
        }),
        prisma.users.count(),
      ]);

      if (users.length === 0) {
        return { wallets: [], total };
      }

      const persistedWallets = await prisma.user_wallets.findMany({
        where: {
          userId: {
            in: users.map((user) => user.id),
          },
        },
        include: {
          user: { select: { id: true, username: true, role: true } },
        },
      });

      const walletByUserId = new Map(
        persistedWallets.map((wallet) => [wallet.userId, wallet])
      );

      const wallets = users.map((user) => {
        const wallet = walletByUserId.get(user.id);
        if (wallet) {
          return {
            ...wallet,
            isVirtual: false,
          };
        }

        return {
          id: `virtual-${user.id}`,
          userId: user.id,
          balance: 0,
          plan: "free",
          alertThreshold: null,
          createdAt: user.createdAt,
          updatedAt: user.lastUpdatedAt || user.createdAt,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
          isVirtual: true,
        };
      });

      return { wallets, total };
    } catch (error) {
      console.error("FAILED TO LIST WALLETS.", error.message);
      return { wallets: [], total: 0 };
    }
  },
};

module.exports = { UserWallet };
