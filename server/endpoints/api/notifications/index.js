const { Notification } = require("../../../models/notification");
const { validApiKey } = require("../../../utils/middleware/validApiKey");

/**
 * 通知系统开发者 API
 * 用于 Swagger 文档生成
 * @param {Express.Application} app
 */
function apiNotificationsEndpoints(app) {
  if (!app) return;

  /**
   * 获取通知列表
   */
  app.get("/v1/notifications", [validApiKey], async (request, response) => {
    /*
        #swagger.tags = ['Notifications']
        #swagger.summary = '获取通知列表'
        #swagger.description = '获取当前用户的通知列表'
        #swagger.parameters['page'] = { in: 'query', type: 'integer', description: '页码', default: 1 }
        #swagger.parameters['limit'] = { in: 'query', type: 'integer', description: '每页数量', default: 20 }
        #swagger.parameters['unreadOnly'] = { in: 'query', type: 'boolean', description: '仅返回未读' }
        #swagger.responses[200] = {
          description: '成功',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  notifications: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        type: { type: 'string', enum: ['balance_warning', 'budget_exceeded', 'api_key_expiring', 'system'] },
                        title: { type: 'string' },
                        content: { type: 'string' },
                        isRead: { type: 'boolean' },
                        createdAt: { type: 'string', format: 'date-time' }
                      }
                    }
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' }
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

      const { page = 1, limit = 20, unreadOnly = false } = request.query;
      const result = await Notification.getByUser(apiKey.createdBy, {
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === "true",
      });

      response.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error("[Notifications API] List error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 获取未读通知数量
   */
  app.get(
    "/v1/notifications/unread-count",
    [validApiKey],
    async (request, response) => {
      /*
        #swagger.tags = ['Notifications']
        #swagger.summary = '获取未读通知数量'
        #swagger.description = '获取当前用户的未读通知总数'
      */
      try {
        const apiKey = response.locals.apiKey;
        if (!apiKey?.createdBy) {
          return response
            .status(401)
            .json({ success: false, error: "无效的 API Key" });
        }

        const count = await Notification.getUnreadCount(apiKey.createdBy);
        response.status(200).json({ success: true, count });
      } catch (error) {
        console.error("[Notifications API] UnreadCount error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 标记通知为已读
   */
  app.patch(
    "/v1/notifications/:id/read",
    [validApiKey],
    async (request, response) => {
      /*
        #swagger.tags = ['Notifications']
        #swagger.summary = '标记通知为已读'
        #swagger.parameters['id'] = { in: 'path', type: 'integer', required: true, description: '通知 ID' }
      */
      try {
        const apiKey = response.locals.apiKey;
        if (!apiKey?.createdBy) {
          return response
            .status(401)
            .json({ success: false, error: "无效的 API Key" });
        }

        const { id } = request.params;
        const result = await Notification.markAsRead(
          parseInt(id),
          apiKey.createdBy
        );

        if (result.success) {
          response.status(200).json({ success: true, message: "已标记为已读" });
        } else {
          response.status(404).json({ success: false, error: "通知不存在" });
        }
      } catch (error) {
        console.error("[Notifications API] MarkAsRead error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 标记所有通知为已读
   */
  app.post(
    "/v1/notifications/read-all",
    [validApiKey],
    async (request, response) => {
      /*
        #swagger.tags = ['Notifications']
        #swagger.summary = '标记所有通知为已读'
        #swagger.description = '将当前用户的所有未读通知标记为已读'
      */
      try {
        const apiKey = response.locals.apiKey;
        if (!apiKey?.createdBy) {
          return response
            .status(401)
            .json({ success: false, error: "无效的 API Key" });
        }

        const result = await Notification.markAllAsRead(apiKey.createdBy);
        response.status(200).json({
          success: true,
          message: `已将 ${result.count} 条通知标记为已读`,
        });
      } catch (error) {
        console.error("[Notifications API] MarkAllAsRead error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { apiNotificationsEndpoints };
