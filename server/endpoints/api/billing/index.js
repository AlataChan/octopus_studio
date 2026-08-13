const { UserWallet, UsageLog } = require("../../../models/billing");
const { validApiKey } = require("../../../utils/middleware/validApiKey");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

function billingDisabledResponse(_request, response) {
  return response.status(404).json({
    success: false,
    error: "Billing feature not enabled",
    code: "BILLING_DISABLED",
  });
}

/**
 * 计费系统开发者 API
 * 用于 Swagger 文档生成
 * @param {Express.Application} app
 */
function apiBillingEndpoints(app) {
  if (!app) return;

  if (!BILLING_ENABLED) {
    app.all(/^\/v1\/billing(?:\/.*)?$/, billingDisabledResponse);
    return;
  }

  /**
   * @swagger
   * /v1/billing/wallet:
   *   get:
   *     tags: [Billing]
   *     summary: 获取当前用户钱包信息
   *     description: 返回当前 API Key 所属用户的钱包余额、套餐等信息
   *     responses:
   *       200:
   *         description: 成功
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success: { type: boolean }
   *                 data:
   *                   type: object
   *                   properties:
   *                     balance: { type: number, description: "积分余额" }
   *                     plan: { type: string, description: "当前套餐" }
   *                     totalSpent: { type: number, description: "累计消费" }
   */
  app.get("/v1/billing/wallet", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['Billing']
        #swagger.summary = '获取当前用户钱包信息'
        #swagger.description = '返回当前 API Key 所属用户的钱包余额、套餐等信息'
        #swagger.responses[200] = {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'object',
                    properties: {
                      balance: { type: 'number', description: '积分余额' },
                      plan: { type: 'string', description: '当前套餐' },
                      totalSpent: { type: 'number', description: '累计消费' },
                      alertThreshold: { type: 'number', description: '预警阈值' }
                    }
                  }
                }
              }
            }
          }
        }
      */
    try {
      const apiKey = response.locals.apiKey;
      if (!apiKey?.createdBy) {
        return response
          .status(401)
          .json({ success: false, error: "无效的 API Key" });
      }

      const wallet = await UserWallet.getOrCreate(apiKey.createdBy);
      response.status(200).json({
        success: true,
        data: {
          balance: wallet.balance,
          plan: wallet.plan,
          totalSpent: wallet.totalSpent || 0,
          alertThreshold: wallet.alertThreshold,
        },
      });
    } catch (e) {
      console.error(e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取使用记录
   */
  app.get("/v1/billing/usage", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['Billing']
        #swagger.summary = '获取使用记录'
        #swagger.description = '获取当前用户的 Token 消耗记录'
        #swagger.parameters['page'] = { in: 'query', type: 'integer', description: '页码' }
        #swagger.parameters['limit'] = { in: 'query', type: 'integer', description: '每页数量' }
        #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: '开始日期 YYYY-MM-DD' }
        #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: '结束日期 YYYY-MM-DD' }
      */
    try {
      const apiKey = response.locals.apiKey;
      if (!apiKey?.createdBy) {
        return response
          .status(401)
          .json({ success: false, error: "无效的 API Key" });
      }

      const { page = 1, limit = 20, startDate, endDate } = request.query;
      const result = await UsageLog.getByUser(apiKey.createdBy, {
        page: parseInt(page),
        limit: parseInt(limit),
        startDate,
        endDate,
      });

      response.status(200).json({ success: true, data: result });
    } catch (e) {
      console.error(e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取使用统计
   */
  app.get(
    "/v1/billing/usage/stats",
    [validApiKey],
    async (request, response) => {
      /*
        #swagger.tags = ['Billing']
        #swagger.summary = '获取使用统计'
        #swagger.description = '获取当前用户的消费统计数据'
        #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: '开始日期' }
        #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: '结束日期' }
      */
      try {
        const apiKey = response.locals.apiKey;
        if (!apiKey?.createdBy) {
          return response
            .status(401)
            .json({ success: false, error: "无效的 API Key" });
        }

        const { startDate, endDate } = request.query;
        const stats = await UsageLog.getUserStats(apiKey.createdBy, {
          startDate,
          endDate,
        });

        response.status(200).json({ success: true, data: stats });
      } catch (e) {
        console.error(e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * 获取计费定价信息
   */
  app.get("/v1/billing/pricing", [validApiKey], async (_request, response) => {
    /*
        #swagger.tags = ['Billing']
        #swagger.summary = '获取计费定价信息'
        #swagger.description = '获取各模型组的 Token 定价'
      */
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
      console.error(e);
      response.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { apiBillingEndpoints };
