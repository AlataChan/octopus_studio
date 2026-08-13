const { Notification } = require("../models/notification");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { systemAdminGuard } = require("../utils/middleware/systemAdminGuard");

/**
 * 通知系统 API 端点
 * @param {Express.Application} app
 */
function notificationEndpoints(app) {
  if (!app) return;

  /**
   * 获取当前用户的通知列表
   * GET /notifications
   */
  app.get("/notifications", [validatedRequest], async (request, response) => {
    try {
      const { page = 1, limit = 20, unreadOnly = false } = request.query;
      if (response.locals.multiUserMode === false) {
        return response.status(200).json({
          success: true,
          notifications: [],
          total: 0,
          page: 1,
          limit: parseInt(limit),
          totalPages: 0,
        });
      }

      const user = request.user || response.locals.user;
      if (!user?.id) {
        return response.status(401).json({ success: false, error: "未授权" });
      }

      const result = await Notification.getByUser(user.id, {
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
   * GET /notifications/unread-count
   */
  app.get(
    "/notifications/unread-count",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode === false) {
          return response.status(200).json({ success: true, count: 0 });
        }

        const user = request.user || response.locals.user;
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const count = await Notification.getUnreadCount(user.id);
        response.status(200).json({ success: true, count });
      } catch (error) {
        console.error("[Notifications API] UnreadCount error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 标记通知为已读
   * PATCH /notifications/:id/read
   */
  app.patch(
    "/notifications/:id/read",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode === false) {
          return response
            .status(200)
            .json({ success: true, message: "已标记为已读" });
        }

        const user = request.user || response.locals.user;
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { id } = request.params;
        const result = await Notification.markAsRead(parseInt(id), user.id);

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
   * POST /notifications/read-all
   */
  app.post(
    "/notifications/read-all",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode === false) {
          return response
            .status(200)
            .json({ success: true, message: "已将 0 条通知标记为已读" });
        }

        const user = request.user || response.locals.user;
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const result = await Notification.markAllAsRead(user.id);
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

  /**
   * 删除通知
   * DELETE /notifications/:id
   */
  app.delete(
    "/notifications/:id",
    [validatedRequest],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode === false) {
          return response
            .status(200)
            .json({ success: true, message: "通知已删除" });
        }

        const user = request.user || response.locals.user;
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { id } = request.params;
        const result = await Notification.delete(parseInt(id), user.id);

        if (result.success) {
          response.status(200).json({ success: true, message: "通知已删除" });
        } else {
          response.status(404).json({ success: false, error: "通知不存在" });
        }
      } catch (error) {
        console.error("[Notifications API] Delete error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );
  /**
   * [Admin] 创建测试通知
   * POST /admin/notifications/test
   */
  app.post(
    "/admin/notifications/test",
    [validatedRequest, systemAdminGuard],
    async (request, response) => {
      try {
        if (response.locals.multiUserMode === false) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const user = request.user || response.locals.user;
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { type = "billing_alert", title, content } = request.body || {};
        const result = await Notification.create({
          userId: user.id,
          type,
          title: title || "💰 余额不足提醒",
          content:
            content ||
            "您的账户余额已低于预警阈值。当前余额: 5,000 积分，预警阈值: 10,000 积分。请及时充值以免影响使用。",
          metadata: { test: true },
        });

        if (result.notification) {
          response
            .status(200)
            .json({ success: true, notification: result.notification });
        } else {
          response.status(500).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error("[Notifications API] Test error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { notificationEndpoints };
