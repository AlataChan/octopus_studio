const {
  UserWallet,
  UsageLog,
  WorkspaceBudget,
} = require("../../models/billing");
const { SystemSettings } = require("../../models/systemSettings");

/**
 * 计费服务 - 处理 LLM 调用的计费逻辑
 *
 * 核心功能:
 * 1. 调用前检查余额和预算
 * 2. 调用后记录消耗和扣费
 * 3. 支持 Workspace 级别预算控制
 */

const BillingService = {
  /**
   * 检查是否启用计费系统
   * @returns {Promise<boolean>}
   */
  isEnabled: async function () {
    const setting = await SystemSettings.get({ label: "billing_enabled" });
    return setting?.value === "true";
  },

  /**
   * 调用前检查 - 验证用户余额和 Workspace 预算
   * @param {Object} params
   * @param {number} params.userId - 用户 ID
   * @param {number} params.workspaceId - 工作区 ID
   * @param {number} [params.estimatedTokens=1000] - 预估 Token 消耗
   * @returns {Promise<{allowed: boolean, reason?: string, warnings?: string[]}>}
   */
  preCheck: async function ({ userId, workspaceId, estimatedTokens = 1000 }) {
    // 如果计费未启用，直接放行
    if (!(await this.isEnabled())) {
      return { allowed: true };
    }

    const warnings = [];

    // 1. 检查用户余额
    if (userId) {
      const { sufficient, balance, shortfall } = await UserWallet.checkBalance(
        userId,
        estimatedTokens
      );

      if (!sufficient) {
        return {
          allowed: false,
          reason: `余额不足，当前余额 ${balance} 积分，预计需要 ${estimatedTokens} 积分，缺口 ${shortfall} 积分`,
        };
      }

      // 余额预警
      const wallet = await UserWallet.get(userId);
      if (wallet && wallet.alertThreshold && balance <= wallet.alertThreshold) {
        warnings.push(
          `余额预警: 当前余额 ${balance} 积分，低于预警阈值 ${wallet.alertThreshold}`
        );
      }
    }

    // 2. 检查 Workspace 预算
    if (workspaceId) {
      const budgetStatus = await WorkspaceBudget.checkBudget(workspaceId);

      if (!budgetStatus.allowed) {
        return {
          allowed: false,
          reason: `Workspace 预算已用尽 (${budgetStatus.usagePercent}%)，操作被 ${budgetStatus.action}`,
        };
      }

      if (budgetStatus.action === "alert") {
        warnings.push(
          `Workspace 预算预警: 已使用 ${budgetStatus.usagePercent}%，剩余 ${budgetStatus.remaining} 积分`
        );
      }
    }

    return { allowed: true, warnings };
  },

  /**
   * 调用后记账 - 记录消耗并扣费
   * @param {Object} params
   * @param {number} params.userId - 用户 ID
   * @param {number} params.workspaceId - 工作区 ID
   * @param {string} [params.assistantId] - 助手 ID
   * @param {string} params.modelName - 模型名称
   * @param {number} params.inputTokens - 输入 Token 数
   * @param {number} params.outputTokens - 输出 Token 数
   * @param {string} [params.apiEndpoint="/chat"] - API 端点
   * @returns {Promise<{success: boolean, creditsUsed?: number, error?: string}>}
   */
  postCharge: async function ({
    userId,
    workspaceId,
    assistantId = null,
    modelName,
    inputTokens,
    outputTokens,
    apiEndpoint = "/chat",
  }) {
    // 如果计费未启用，只记录日志不扣费
    if (!(await this.isEnabled())) {
      return {
        success: true,
        creditsUsed: 0,
        message: "计费未启用，仅记录日志",
      };
    }

    try {
      // 1. 记录使用日志
      const logResult = await UsageLog.create({
        userId,
        workspaceId,
        assistantId,
        modelName,
        inputTokens,
        outputTokens,
        apiEndpoint,
      });

      if (!logResult.success) {
        console.error(
          "[BillingService] Failed to create usage log:",
          logResult.error
        );
        return { success: false, error: logResult.error };
      }

      const { creditsUsed } = logResult;

      // 2. 从用户余额扣费
      if (userId && creditsUsed > 0) {
        const deductResult = await UserWallet.deduct(userId, creditsUsed);
        if (!deductResult.success) {
          console.error(
            "[BillingService] Failed to deduct balance:",
            deductResult.error
          );
          // 扣费失败不阻塞，但记录错误
        }
      }

      // 3. 更新 Workspace 月度使用量
      if (workspaceId && creditsUsed > 0) {
        const budgetResult = await WorkspaceBudget.addUsage(
          workspaceId,
          creditsUsed
        );
        if (budgetResult.exceeded) {
          console.warn(
            `[BillingService] Workspace ${workspaceId} has exceeded monthly budget`
          );
        }
      }

      // 4. 异步检查告警（不阻塞返回）
      setImmediate(async () => {
        try {
          const { AlertService } = require("./alertService");
          await AlertService.checkAfterCharge(userId, workspaceId);
        } catch (alertError) {
          console.error(
            "[BillingService] Alert check error:",
            alertError.message
          );
        }
      });

      return { success: true, creditsUsed };
    } catch (error) {
      console.error("[BillingService] postCharge error:", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取模型分组
   * @param {string} modelName - 模型名称
   * @returns {string} - international/domestic
   */
  getModelGroup: function (modelName) {
    return UsageLog.getModelGroup(modelName);
  },

  /**
   * 计算积分消耗
   * @param {string} modelGroup - 模型分组
   * @param {number} inputTokens - 输入 Token 数
   * @param {number} outputTokens - 输出 Token 数
   * @returns {number} - 消耗的积分
   */
  calculateCredits: function (modelGroup, inputTokens, outputTokens) {
    return UsageLog.calculateCredits(modelGroup, inputTokens, outputTokens);
  },
};

module.exports = { BillingService };
