const { ApiKey } = require("../models/apiKeys");
const { EventLogs } = require("../models/eventLogs");
const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

/**
 * 用户 API Key 管理端点
 * @param {Express.Application} app
 */
function apiKeyEndpoints(app) {
  if (!app) return;

  /**
   * 获取当前用户的 API Keys
   * GET /user/api-keys
   */
  app.get("/user/api-keys", [validatedRequest], async (request, response) => {
    try {
      const user = await userFromSession(request, response);
      if (!user?.id) {
        return response.status(401).json({ success: false, error: "未授权" });
      }

      const apiKeys = await ApiKey.getByUser(user.id);
      response.status(200).json({ success: true, apiKeys });
    } catch (error) {
      console.error("[API Keys] List error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 创建新的 API Key
   * POST /user/api-keys
   */
  app.post("/user/api-keys", [validatedRequest], async (request, response) => {
    try {
      const user = await userFromSession(request, response);
      if (!user?.id) {
        return response.status(401).json({ success: false, error: "未授权" });
      }

      const { name, expiresAt, rateLimit } = reqBody(request);

      // 限制每个用户最多 5 个 API Key
      const existingCount = await ApiKey.count({ createdBy: user.id });
      if (existingCount >= 5) {
        return response.status(400).json({
          success: false,
          error: "已达到 API Key 数量上限 (5个)",
        });
      }

      const { apiKey, error } = await ApiKey.create(user.id, {
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
        user.id
      );

      response.status(200).json({
        success: true,
        apiKey: {
          ...apiKey,
          // 只在创建时返回完整密钥
          secret: apiKey.secret,
        },
        message: "API Key 创建成功，请妥善保存密钥，此后将无法再次查看完整密钥",
      });
    } catch (error) {
      console.error("[API Keys] Create error:", error);
      response.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 更新 API Key
   * PATCH /user/api-keys/:id
   */
  app.patch(
    "/user/api-keys/:id",
    [validatedRequest],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { id } = request.params;
        const { name, isActive, expiresAt, rateLimit } = reqBody(request);

        // 验证 API Key 属于当前用户
        const existing = await ApiKey.get({
          id: parseInt(id),
          createdBy: user.id,
        });
        if (!existing) {
          return response
            .status(404)
            .json({ success: false, error: "API Key 不存在" });
        }

        const { apiKey, error } = await ApiKey.update(parseInt(id), {
          name,
          isActive,
          expiresAt,
          rateLimit,
        });

        if (error) {
          return response.status(500).json({ success: false, error });
        }

        await EventLogs.logEvent(
          "api_key_updated",
          { keyId: apiKey.id, changes: { name, isActive } },
          user.id
        );

        response.status(200).json({ success: true, apiKey });
      } catch (error) {
        console.error("[API Keys] Update error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 重新生成 API Key 密钥
   * POST /user/api-keys/:id/regenerate
   */
  app.post(
    "/user/api-keys/:id/regenerate",
    [validatedRequest],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { id } = request.params;

        // 验证 API Key 属于当前用户
        const existing = await ApiKey.get({
          id: parseInt(id),
          createdBy: user.id,
        });
        if (!existing) {
          return response
            .status(404)
            .json({ success: false, error: "API Key 不存在" });
        }

        const { apiKey, error } = await ApiKey.regenerate(parseInt(id));

        if (error) {
          return response.status(500).json({ success: false, error });
        }

        await EventLogs.logEvent(
          "api_key_regenerated",
          { keyId: apiKey.id },
          user.id
        );

        response.status(200).json({
          success: true,
          apiKey: { ...apiKey, secret: apiKey.secret },
          message: "密钥已重新生成，请妥善保存",
        });
      } catch (error) {
        console.error("[API Keys] Regenerate error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  /**
   * 删除 API Key
   * DELETE /user/api-keys/:id
   */
  app.delete(
    "/user/api-keys/:id",
    [validatedRequest],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        if (!user?.id) {
          return response.status(401).json({ success: false, error: "未授权" });
        }

        const { id } = request.params;

        // 验证 API Key 属于当前用户
        const existing = await ApiKey.get({
          id: parseInt(id),
          createdBy: user.id,
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
          user.id
        );

        response.status(200).json({ success: true, message: "API Key 已删除" });
      } catch (error) {
        console.error("[API Keys] Delete error:", error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { apiKeyEndpoints };
