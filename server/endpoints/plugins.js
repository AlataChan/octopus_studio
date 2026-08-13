/**
 * 插件管理 API 端点
 *
 * @description
 * 提供插件扫描、导入、管理的 REST API
 *
 * @module server/endpoints/plugins
 */

const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { reqBody } = require("../utils/http");
const {
  PluginType,
  scanPlugins,
  scanAllPlugins,
  importFromMarkdown,
  batchImport,
  pluginCache,
} = require("../utils/plugins");

/**
 * 注册插件管理 API 路由
 * @param {import('express').Application} app - Express 应用实例
 */
function pluginEndpoints(app) {
  if (!app) return;

  /**
   * 获取所有插件列表
   * GET /api/v1/plugins
   * Query: ?type=agent|command|skill&forceRefresh=true
   */
  app.get(
    "/api/v1/plugins",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (req, res) => {
      try {
        const { type, forceRefresh } = req.query;
        const options = { forceRefresh: forceRefresh === "true" };

        let result;
        if (type && Object.values(PluginType).includes(type)) {
          const plugins = await scanPlugins(type, options);
          result = { [type + "s"]: plugins };
        } else {
          result = await scanAllPlugins(options);
        }

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[Plugins API] Error scanning plugins:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 获取单个插件详情
   * GET /api/v1/plugins/:type/:id
   */
  app.get(
    "/api/v1/plugins/:type/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (req, res) => {
      try {
        const { type, id } = req.params;

        if (!Object.values(PluginType).includes(type)) {
          return res.status(400).json({
            success: false,
            error: `无效的插件类型: ${type}`,
          });
        }

        const plugins = await scanPlugins(type);
        const plugin = plugins.find((p) => p.id === id);

        if (!plugin) {
          return res.status(404).json({
            success: false,
            error: "插件不存在",
          });
        }

        return res.status(200).json({
          success: true,
          data: plugin,
        });
      } catch (error) {
        console.error("[Plugins API] Error getting plugin:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 从 Markdown 内容导入插件
   * POST /api/v1/plugins/import
   * Body: { content: string, filePath: string, pluginType: string }
   */
  app.post(
    "/api/v1/plugins/import",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (req, res) => {
      try {
        const { content, filePath, pluginType } = reqBody(req);

        if (!content || !filePath || !pluginType) {
          return res.status(400).json({
            success: false,
            error: "缺少必填参数: content, filePath, pluginType",
          });
        }

        if (!Object.values(PluginType).includes(pluginType)) {
          return res.status(400).json({
            success: false,
            error: `无效的插件类型: ${pluginType}`,
          });
        }

        const result = await importFromMarkdown(content, filePath, pluginType);
        return res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        console.error("[Plugins API] Error importing plugin:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 获取缓存统计
   * GET /api/v1/plugins/cache/stats
   */
  app.get(
    "/api/v1/plugins/cache/stats",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_req, res) => {
      try {
        const stats = pluginCache.getStats();
        return res.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 清除插件缓存
   * POST /api/v1/plugins/cache/clear
   */
  app.post(
    "/api/v1/plugins/cache/clear",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_req, res) => {
      try {
        pluginCache.clear();
        return res.status(200).json({
          success: true,
          message: "缓存已清除",
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { pluginEndpoints };
