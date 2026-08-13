const { ApiKey } = require("../../../models/apiKeys");
const { EventLogs } = require("../../../models/eventLogs");
const { reqBody } = require("../../../utils/http");
const { validApiKey } = require("../../../utils/middleware/validApiKey");

/**
 * API Key 管理开发者 API
 * 用于 Swagger 文档生成
 * @param {Express.Application} app
 */
function apiApiKeysEndpoints(app) {
  if (!app) return;

  /**
   * 获取当前用户的 API Keys 列表
   */
  app.get("/v1/api-keys", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['API Keys']
        #swagger.summary = '获取 API Keys 列表'
        #swagger.description = '获取当前用户创建的所有 API Keys（不含密钥明文）'
        #swagger.responses[200] = {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  apiKeys: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        isActive: { type: 'boolean' },
                        expiresAt: { type: 'string', format: 'date-time' },
                        rateLimit: { type: 'integer' },
                        usageCount: { type: 'integer' },
                        lastUsedAt: { type: 'string', format: 'date-time' },
                        createdAt: { type: 'string', format: 'date-time' }
                      }
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

      const apiKeys = await ApiKey.getByUser(apiKey.createdBy);
      response.status(200).json({ success: true, apiKeys });
    } catch (error) {
      console.error("[API Keys] List error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 创建新的 API Key
   */
  app.post("/v1/api-keys", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['API Keys']
        #swagger.summary = '创建新 API Key'
        #swagger.description = '创建新的 API Key，每用户最多 5 个'
        #swagger.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'API Key 名称' },
                  expiresAt: { type: 'string', format: 'date-time', description: '过期时间' },
                  rateLimit: { type: 'integer', default: 100, description: '速率限制(请求/分钟)' }
                }
              }
            }
          }
        }
      */
    try {
      const currentApiKey = response.locals.apiKey;
      if (!currentApiKey?.createdBy) {
        return response
          .status(401)
          .json({ success: false, error: "无效的 API Key" });
      }

      const { name, expiresAt, rateLimit } = reqBody(request);
      const existingCount = await ApiKey.count({
        createdBy: currentApiKey.createdBy,
      });
      if (existingCount >= 5) {
        return response.status(400).json({
          success: false,
          error: "已达到 API Key 数量上限 (5个)",
        });
      }

      const { apiKey, error } = await ApiKey.create(currentApiKey.createdBy, {
        name: name || `API Key ${existingCount + 1}`,
        expiresAt,
        rateLimit: rateLimit || 100,
      });

      if (error) {
        return response.status(500).json({ success: false, error });
      }

      await EventLogs.logEvent(
        "api_key_created",
        { keyId: apiKey.id, name: apiKey.name },
        currentApiKey.createdBy
      );

      response.status(200).json({
        success: true,
        apiKey: { ...apiKey, secret: apiKey.secret },
        message: "API Key 创建成功，请妥善保存密钥",
      });
    } catch (error) {
      console.error("[API Keys] Create error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 删除 API Key
   */
  app.delete("/v1/api-keys/:id", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['API Keys']
        #swagger.summary = '删除 API Key'
        #swagger.parameters['id'] = { in: 'path', type: 'integer', required: true, description: 'API Key ID' }
      */
    try {
      const currentApiKey = response.locals.apiKey;
      if (!currentApiKey?.createdBy) {
        return response
          .status(401)
          .json({ success: false, error: "无效的 API Key" });
      }

      const { id } = request.params;
      const existing = await ApiKey.get({
        id: parseInt(id),
        createdBy: currentApiKey.createdBy,
      });
      if (!existing) {
        return response
          .status(404)
          .json({ success: false, error: "API Key 不存在" });
      }

      await ApiKey.delete({ id: parseInt(id) });
      await EventLogs.logEvent(
        "api_key_deleted",
        { keyId: parseInt(id) },
        currentApiKey.createdBy
      );

      response.status(200).json({ success: true, message: "API Key 已删除" });
    } catch (error) {
      console.error("[API Keys] Delete error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { apiApiKeysEndpoints };
