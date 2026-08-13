const { Notification } = require("../../models/notification");
const { UserWallet } = require("../../models/billing/userWallet");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
const BILLING_DISABLED_RESULT = {
  skipped: true,
  reason: "BILLING_ENABLED=false",
};

/**
 * 计费告警服务 - 检测余额/预算并发送通知
 */
const AlertService = {
  /**
   * 检查用户余额并发送告警
   * @param {number} userId - 用户 ID
   * @param {number} currentBalance - 当前余额
   * @param {number} alertThreshold - 告警阈值
   * @returns {Promise<boolean>} - 是否发送了告警
   */
  checkBalanceAlert: async function (userId, currentBalance, alertThreshold) {
    if (!BILLING_ENABLED) return BILLING_DISABLED_RESULT;

    if (!alertThreshold || currentBalance > alertThreshold) return false;

    // 检查是否已经发送过相同告警（24小时内）
    const recentAlert = await this._hasRecentAlert(userId, "billing_alert", 24);
    if (recentAlert) return false;

    // 发送余额不足告警
    const { notification, error } = await Notification.create({
      userId,
      type: Notification.TYPES.BILLING_ALERT,
      title: "💰 余额不足提醒",
      content: `您的账户余额已低于预警阈值。当前余额: ${currentBalance.toLocaleString()} 积分，预警阈值: ${alertThreshold.toLocaleString()} 积分。请及时充值以免影响使用。`,
      metadata: {
        currentBalance,
        alertThreshold,
        alertType: "low_balance",
      },
    });

    if (error) {
      console.error("[AlertService] Failed to create balance alert:", error);
      return false;
    }

    console.log(`[AlertService] Balance alert sent to user ${userId}`);
    return true;
  },

  sendBudgetAlert: async function (budget, workspaceId, adminUserIds = []) {
    if (!BILLING_ENABLED) return BILLING_DISABLED_RESULT;
    return this.checkBudgetAlert(budget, workspaceId, adminUserIds);
  },

  /**
   * 检查工作区预算并发送告警
   * @param {Object} budget - 工作区预算对象
   * @param {number} workspaceId - 工作区 ID
   * @param {number[]} adminUserIds - 管理员用户 ID 数组
   * @returns {Promise<boolean>}
   */
  checkBudgetAlert: async function (budget, workspaceId, adminUserIds = []) {
    if (!BILLING_ENABLED) return BILLING_DISABLED_RESULT;

    if (!budget || !budget.monthlyLimit || !budget.alertAt) return false;

    const usagePercent = (budget.usedThisMonth / budget.monthlyLimit) * 100;
    if (usagePercent < budget.alertAt) return false;

    // 检查是否已经发送过相同告警（24小时内）
    const recentAlert = await this._hasRecentAlert(
      adminUserIds[0],
      "budget_alert",
      24,
      { workspaceId }
    );
    if (recentAlert) return false;

    // 确定告警级别
    let alertLevel = "warning";
    let title = "⚠️ 工作区预算预警";

    if (usagePercent >= 100) {
      alertLevel = "critical";
      title = "🚨 工作区预算已用尽";
    } else if (usagePercent >= 90) {
      alertLevel = "high";
      title = "⚠️ 工作区预算即将用尽";
    }

    const content =
      `工作区预算使用已达 ${usagePercent.toFixed(1)}%。` +
      `已使用: ${budget.usedThisMonth.toLocaleString()} / ${budget.monthlyLimit.toLocaleString()} 积分。` +
      (budget.actionOnLimit === "block" ? " 超限后将停止服务。" : "");

    // 给所有管理员发送通知
    if (adminUserIds.length > 0) {
      await Notification.createMany(adminUserIds, {
        type: Notification.TYPES.BUDGET_ALERT,
        title,
        content,
        metadata: {
          workspaceId,
          usagePercent,
          usedThisMonth: budget.usedThisMonth,
          monthlyLimit: budget.monthlyLimit,
          alertLevel,
        },
      });
      console.log(
        `[AlertService] Budget alert sent for workspace ${workspaceId}`
      );
    }

    return true;
  },

  /**
   * 扣费后检查告警
   * @param {number} userId - 用户 ID
   * @param {number} workspaceId - 工作区 ID
   * @returns {Promise<void>}
   */
  checkAfterCharge: async function (userId, workspaceId) {
    if (!BILLING_ENABLED) return BILLING_DISABLED_RESULT;

    try {
      // 检查用户余额
      const wallet = await UserWallet.getByUserId(userId);
      if (wallet) {
        await this.checkBalanceAlert(
          userId,
          wallet.balance,
          wallet.alertThreshold
        );
      }

      // TODO(PR-014): future work, gated by BILLING_ENABLED.
      // 检查工作区预算（需要获取管理员列表）
      // const budget = await WorkspaceBudget.getByWorkspaceId(workspaceId);
      // if (budget) {
      //   const admins = await getWorkspaceAdmins(workspaceId);
      //   await this.checkBudgetAlert(budget, workspaceId, admins);
      // }
    } catch (error) {
      console.error("[AlertService] CheckAfterCharge error:", error);
    }
  },

  /**
   * 检查是否有最近的相同类型告警
   * @private
   */
  _hasRecentAlert: async function (userId, type, hours = 24, metadata = {}) {
    const prisma = require("../prisma");
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      const recent = await prisma.notifications.findFirst({
        where: {
          userId,
          type,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!recent) return false;

      // 如果有 metadata 条件，需要额外检查
      if (Object.keys(metadata).length > 0 && recent.metadata) {
        const parsed = JSON.parse(recent.metadata);
        for (const [key, value] of Object.entries(metadata)) {
          if (parsed[key] !== value) return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  },
};

module.exports = { AlertService };
