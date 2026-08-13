const { UserWallet, WalletTopup, UsageLog } = require("../models/billing");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { userFromSession } = require("../utils/http");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

function billingDisabledResponse(_request, response) {
  return response.status(404).json({
    success: false,
    error: "Billing feature not enabled",
    code: "BILLING_DISABLED",
  });
}

/**
 * 用户自助计费查询端点 - V1.5
 * 允许所有登录用户查看自己的余额、使用记录等
 * @param {Express.Application} app
 * @param {Express.Router} router
 */
function userBillingEndpoints(app, router) {
  if (!router) return;

  if (!BILLING_ENABLED) {
    router.all(/^\/user\/billing(?:\/.*)?$/, billingDisabledResponse);
    return;
  }

  /**
   * 获取当前用户钱包信息
   */
  router.get(
    "/user/billing/wallet",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const wallet = await UserWallet.getOrCreate(user.id);
        response.status(200).json({
          success: true,
          data: {
            balance: wallet.balance,
            plan: wallet.plan,
            totalSpent: wallet.totalSpent || 0,
            alertThreshold: wallet.alertThreshold,
            createdAt: wallet.createdAt,
          },
        });
      } catch (e) {
        console.error("[User Billing] Wallet error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取当前用户使用记录
   */
  router.get(
    "/user/billing/usage",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const {
          page = 1,
          limit = 20,
          startDate,
          endDate,
          modelGroup,
          workspaceId,
        } = request.query;
        const result = await UsageLog.getByUser(user.id, {
          page: parseInt(page),
          limit: parseInt(limit),
          startDate,
          endDate,
          modelGroup,
          workspaceId,
        });

        response.status(200).json({ success: true, data: result });
      } catch (e) {
        console.error("[User Billing] Usage error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取当前用户使用统计
   */
  router.get(
    "/user/billing/stats",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { startDate, endDate } = request.query;
        const stats = await UsageLog.getUserStats(user.id, {
          startDate,
          endDate,
        });

        response.status(200).json({ success: true, data: stats });
      } catch (e) {
        console.error("[User Billing] Stats error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取当前用户每日使用趋势
   */
  router.get(
    "/user/billing/trend",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { days = 30 } = request.query;
        const trend = await UsageLog.getDailyTrend(user.id, parseInt(days));

        response.status(200).json({ success: true, data: trend });
      } catch (e) {
        console.error("[User Billing] Trend error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取当前用户模型使用排行
   */
  router.get(
    "/user/billing/model-ranking",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { startDate, endDate, limit = 10 } = request.query;
        const ranking = await UsageLog.getModelRanking(user.id, {
          startDate,
          endDate,
          limit: parseInt(limit),
        });

        response.status(200).json({ success: true, data: ranking });
      } catch (e) {
        console.error("[User Billing] ModelRanking error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取当前用户充值记录
   */
  router.get(
    "/user/billing/topups",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { page = 1, limit = 20 } = request.query;
        const result = await WalletTopup.getByUserId(user.id, {
          page: parseInt(page),
          limit: parseInt(limit),
        });

        response.status(200).json({ success: true, data: result });
      } catch (e) {
        console.error("[User Billing] Topups error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取定价信息
   */
  router.get(
    "/user/billing/pricing",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        response.status(200).json({
          success: true,
          data: {
            tokenPricing: UsageLog.TOKEN_PRICING,
            modelGroups: UsageLog.MODEL_GROUP_MAP,
            creditUnit: "1积分 = ¥0.001",
          },
        });
      } catch (e) {
        console.error("[User Billing] Pricing error:", e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

module.exports = { userBillingEndpoints };
