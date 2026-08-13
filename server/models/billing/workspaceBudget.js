const prisma = require("../../utils/prisma");

/**
 * @typedef {Object} WorkspaceBudget
 * @property {number} id
 * @property {number} workspaceId
 * @property {number|null} monthlyLimit - 月度预算上限(积分)
 * @property {number} usedThisMonth - 本月已使用(积分)
 * @property {number} resetDay - 每月重置日(1-28)
 * @property {number|null} alertAt - 预警阈值(百分比)
 * @property {string} actionOnLimit - alert/throttle/block
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

const WorkspaceBudget = {
  /**
   * 获取或创建 Workspace 预算配置
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<WorkspaceBudget>}
   */
  getOrCreate: async function (workspaceId) {
    try {
      let budget = await prisma.workspace_budgets.findUnique({
        where: { workspaceId: parseInt(workspaceId) },
      });

      if (!budget) {
        budget = await prisma.workspace_budgets.create({
          data: { workspaceId: parseInt(workspaceId) },
        });
      }

      return budget;
    } catch (error) {
      console.error("FAILED TO GET OR CREATE BUDGET.", error.message);
      return null;
    }
  },

  /**
   * 获取 Workspace 预算配置
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<WorkspaceBudget|null>}
   */
  get: async function (workspaceId) {
    try {
      return await prisma.workspace_budgets.findUnique({
        where: { workspaceId: parseInt(workspaceId) },
      });
    } catch (error) {
      console.error("FAILED TO GET BUDGET.", error.message);
      return null;
    }
  },

  /**
   * 更新预算配置
   * @param {number} workspaceId - 工作区ID
   * @param {Object} data - 更新数据
   * @returns {Promise<{success: boolean, budget?: WorkspaceBudget, error?: string}>}
   */
  update: async function (workspaceId, data) {
    const { monthlyLimit, resetDay, alertAt, actionOnLimit } = data;

    const updateData = {};
    if (monthlyLimit !== undefined) updateData.monthlyLimit = monthlyLimit;
    if (resetDay !== undefined) {
      if (resetDay < 1 || resetDay > 28) {
        return { success: false, error: "重置日必须在1-28之间" };
      }
      updateData.resetDay = resetDay;
    }
    if (alertAt !== undefined) {
      if (alertAt < 0 || alertAt > 100) {
        return { success: false, error: "预警阈值必须在0-100之间" };
      }
      updateData.alertAt = alertAt;
    }
    if (actionOnLimit !== undefined) {
      const validActions = ["alert", "throttle", "block"];
      if (!validActions.includes(actionOnLimit)) {
        return { success: false, error: `无效的限制操作: ${actionOnLimit}` };
      }
      updateData.actionOnLimit = actionOnLimit;
    }

    try {
      await this.getOrCreate(workspaceId);
      const budget = await prisma.workspace_budgets.update({
        where: { workspaceId: parseInt(workspaceId) },
        data: updateData,
      });
      return { success: true, budget };
    } catch (error) {
      console.error("FAILED TO UPDATE BUDGET.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 增加本月使用量
   * @param {number} workspaceId - 工作区ID
   * @param {number} amount - 增加的积分数
   * @returns {Promise<{success: boolean, budget?: WorkspaceBudget, exceeded?: boolean, error?: string}>}
   */
  addUsage: async function (workspaceId, amount) {
    try {
      const budget = await this.getOrCreate(workspaceId);

      const updatedBudget = await prisma.workspace_budgets.update({
        where: { workspaceId: parseInt(workspaceId) },
        data: { usedThisMonth: budget.usedThisMonth + parseInt(amount) },
      });

      // 检查是否超出预算
      let exceeded = false;
      if (
        updatedBudget.monthlyLimit &&
        updatedBudget.usedThisMonth >= updatedBudget.monthlyLimit
      ) {
        exceeded = true;
      }

      return { success: true, budget: updatedBudget, exceeded };
    } catch (error) {
      console.error("FAILED TO ADD USAGE.", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 检查预算状态
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<{allowed: boolean, action: string, usagePercent: number, remaining: number}>}
   */
  checkBudget: async function (workspaceId) {
    const budget = await this.getOrCreate(workspaceId);

    // 无预算限制
    if (!budget.monthlyLimit) {
      return {
        allowed: true,
        action: "none",
        usagePercent: 0,
        remaining: Infinity,
      };
    }

    const usagePercent = Math.round(
      (budget.usedThisMonth / budget.monthlyLimit) * 100
    );
    const remaining = Math.max(0, budget.monthlyLimit - budget.usedThisMonth);

    // 超出预算
    if (budget.usedThisMonth >= budget.monthlyLimit) {
      return {
        allowed: budget.actionOnLimit !== "block",
        action: budget.actionOnLimit,
        usagePercent,
        remaining,
      };
    }

    // 达到预警阈值
    if (budget.alertAt && usagePercent >= budget.alertAt) {
      return { allowed: true, action: "alert", usagePercent, remaining };
    }

    return { allowed: true, action: "none", usagePercent, remaining };
  },

  /**
   * 重置月度使用量
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  resetMonthlyUsage: async function (workspaceId) {
    try {
      await prisma.workspace_budgets.update({
        where: { workspaceId: parseInt(workspaceId) },
        data: { usedThisMonth: 0 },
      });
      return { success: true };
    } catch (error) {
      console.error("FAILED TO RESET USAGE.", error.message);
      return { success: false, error: error.message };
    }
  },
};

module.exports = { WorkspaceBudget };
