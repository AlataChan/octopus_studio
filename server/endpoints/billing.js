const {
  UserWallet,
  WalletTopup,
  UsageLog,
  WorkspaceBudget,
} = require("../models/billing");
const { EventLogs } = require("../models/eventLogs");
const { SystemSettings } = require("../models/systemSettings");
const { User } = require("../models/user");
const { reqBody, userFromSession } = require("../utils/http");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

function billingDisabledResponse(_request, response) {
  return response.status(404).json({
    success: false,
    error: "Billing feature not enabled",
    code: "BILLING_DISABLED",
  });
}

/**
 * 计费系统 API 端点 - V1.5
 * @param {Express.Application} app
 */
function billingEndpoints(app) {
  if (!app) return;

  if (!BILLING_ENABLED) {
    app.all(/^\/admin\/billing(?:\/.*)?$/, billingDisabledResponse);
    return;
  }

  // ============================================
  // 计费系统配置 (Admin Only)
  // ============================================

  /**
   * 获取计费系统配置
   * GET /admin/billing/config
   */
  app.get(
    "/admin/billing/config",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const billingEnabled = await SystemSettings.isBillingEnabled();
        response.status(200).json({
          success: true,
          data: {
            billingEnabled,
            tokenPricing: UsageLog.TOKEN_PRICING,
            modelGroups: UsageLog.MODEL_GROUP_MAP,
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 更新计费系统配置
   * PATCH /admin/billing/config
   */
  app.patch(
    "/admin/billing/config",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { billingEnabled } = reqBody(request);

        if (
          typeof billingEnabled === "boolean" ||
          typeof billingEnabled === "string"
        ) {
          await SystemSettings.updateSettings({
            billing_enabled: billingEnabled,
          });
        }

        const newBillingEnabled = await SystemSettings.isBillingEnabled();
        response.status(200).json({
          success: true,
          data: { billingEnabled: newBillingEnabled },
          message: `计费系统已${newBillingEnabled ? "启用" : "禁用"}`,
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ============================================
  // 用户钱包管理 (Admin Only)
  // ============================================

  /**
   * 获取用户钱包信息
   * GET /admin/billing/wallets/:userId
   */
  app.get(
    "/admin/billing/wallets/:userId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { userId } = request.params;
        const user = await User.get({ id: parseInt(userId) });
        if (!user) {
          return response
            .status(404)
            .json({ success: false, error: "用户不存在" });
        }

        const wallet = await UserWallet.getOrCreate(parseInt(userId));
        const { topups } = await WalletTopup.getByUserId(parseInt(userId), {
          limit: 10,
        });

        response.status(200).json({
          success: true,
          data: {
            wallet,
            user: { id: user.id, username: user.username, role: user.role },
            recentTopups: topups,
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取所有用户钱包列表
   * GET /admin/billing/wallets
   */
  app.get(
    "/admin/billing/wallets",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { page = 1, limit = 20 } = request.query;
        const { wallets, total } = await UserWallet.list({
          page: parseInt(page),
          limit: parseInt(limit),
        });

        response.status(200).json({
          success: true,
          data: {
            wallets,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * Admin 充值
   * POST /admin/billing/wallets/:userId/topup
   */
  app.post(
    "/admin/billing/wallets/:userId/topup",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { userId } = request.params;
        const operator = await userFromSession(request, response);
        const {
          amount,
          method = "admin_grant",
          invoiceNo,
          note,
        } = reqBody(request);

        if (!amount || amount <= 0) {
          return response
            .status(400)
            .json({ success: false, error: "充值金额必须大于0" });
        }

        const targetUser = await User.get({ id: parseInt(userId) });
        if (!targetUser) {
          return response
            .status(404)
            .json({ success: false, error: "目标用户不存在" });
        }

        const result = await UserWallet.topup(parseInt(userId), amount, {
          method,
          operatorId: operator.id,
          invoiceNo,
          note,
        });

        if (!result.success) {
          return response.status(400).json(result);
        }

        // 记录事件日志
        await EventLogs.logEvent(
          "wallet_topup",
          {
            targetUserId: userId,
            targetUsername: targetUser.username,
            amount,
            method,
            operatorUsername: operator.username,
          },
          operator.id
        );

        response.status(200).json({
          success: true,
          data: {
            wallet: result.wallet,
            topup: result.topup,
            message: `成功为用户 ${targetUser.username} 充值 ${amount} 积分`,
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 更新用户套餐
   * PATCH /admin/billing/wallets/:userId/plan
   */
  app.patch(
    "/admin/billing/wallets/:userId/plan",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { userId } = request.params;
        const { plan } = reqBody(request);

        const result = await UserWallet.updatePlan(parseInt(userId), plan);
        if (!result.success) {
          return response.status(400).json(result);
        }

        response
          .status(200)
          .json({ success: true, data: { wallet: result.wallet } });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ============================================
  // Workspace 预算控制 (Admin/Manager)
  // ============================================

  /**
   * 获取 Workspace 预算配置
   * GET /admin/billing/workspaces/:workspaceId/budget
   */
  app.get(
    "/admin/billing/workspaces/:workspaceId/budget",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { workspaceId } = request.params;
        const budget = await WorkspaceBudget.getOrCreate(parseInt(workspaceId));
        const status = await WorkspaceBudget.checkBudget(parseInt(workspaceId));

        response.status(200).json({
          success: true,
          data: { budget, status },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 更新 Workspace 预算配置
   * PATCH /admin/billing/workspaces/:workspaceId/budget
   */
  app.patch(
    "/admin/billing/workspaces/:workspaceId/budget",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { workspaceId } = request.params;
        const { monthlyLimit, resetDay, alertAt, actionOnLimit } =
          reqBody(request);

        const result = await WorkspaceBudget.update(parseInt(workspaceId), {
          monthlyLimit,
          resetDay,
          alertAt,
          actionOnLimit,
        });

        if (!result.success) {
          return response.status(400).json(result);
        }

        response
          .status(200)
          .json({ success: true, data: { budget: result.budget } });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 重置 Workspace 月度使用量
   * POST /admin/billing/workspaces/:workspaceId/budget/reset
   */
  app.post(
    "/admin/billing/workspaces/:workspaceId/budget/reset",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { workspaceId } = request.params;
        const result = await WorkspaceBudget.resetMonthlyUsage(
          parseInt(workspaceId)
        );

        if (!result.success) {
          return response.status(400).json(result);
        }

        response
          .status(200)
          .json({ success: true, message: "月度使用量已重置" });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  // ============================================
  // 使用统计 (Admin)
  // ============================================

  /**
   * 获取使用统计概览
   * GET /admin/billing/usage/summary
   */
  app.get(
    "/admin/billing/usage/summary",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { startDate, endDate } = request.query;
        const topupStats = await WalletTopup.getStats({ startDate, endDate });

        response.status(200).json({
          success: true,
          data: {
            topups: topupStats,
            period: { startDate, endDate },
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取用户使用详情
   * GET /admin/billing/usage/users/:userId
   */
  app.get(
    "/admin/billing/usage/users/:userId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { userId } = request.params;
        const { startDate, endDate } = request.query;

        const stats = await UsageLog.getUserStats(parseInt(userId), {
          startDate,
          endDate,
        });
        const wallet = await UserWallet.get(parseInt(userId));

        response.status(200).json({
          success: true,
          data: {
            stats,
            wallet,
            period: { startDate, endDate },
          },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取充值记录列表
   * GET /admin/billing/topups
   */
  app.get(
    "/admin/billing/topups",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const {
          page = 1,
          limit = 20,
          method,
          startDate,
          endDate,
        } = request.query;
        const { topups, total } = await WalletTopup.list({
          page: parseInt(page),
          limit: parseInt(limit),
          method,
          startDate,
          endDate,
        });

        response.status(200).json({
          success: true,
          data: { topups, total, page: parseInt(page), limit: parseInt(limit) },
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

module.exports = { billingEndpoints };
