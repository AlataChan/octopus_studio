/**
 * 记忆系统监控 API 端点
 *
 * Phase 1 任务 4: 记忆健康度监控 API
 *
 * @module endpoints/api/memoryStats
 */

const { validApiKey } = require("../../utils/middleware/validApiKey");
const {
  flexUserRoleValid,
} = require("../../utils/middleware/multiUserProtected");
const { ROLES } = require("../../utils/middleware/multiUserProtected");
const { Workspace } = require("../../models/workspace");
const { MemoryStats } = require("../../utils/memory/memoryStats");

/**
 * 注册记忆监控相关的 API 端点
 * @param {Express} app - Express 应用实例
 */
function memoryStatsEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/v1/system/memory-stats
   * 获取系统级记忆统计（仅管理员）
   */
  app.get(
    "/v1/system/memory-stats",
    [validApiKey, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const stats = await MemoryStats.getSystemStats();

        response.status(200).json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error("[MemoryStats API] Error getting system stats:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/workspace/:slug/memory-stats
   * 获取 Workspace 级记忆统计
   */
  app.get(
    "/v1/workspace/:slug/memory-stats",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const stats = await MemoryStats.getWorkspaceStats(workspace.id);

        response.status(200).json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error(
          "[MemoryStats API] Error getting workspace stats:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/system/memory-health
   * 获取系统记忆健康度摘要（仅管理员）
   */
  app.get(
    "/v1/system/memory-health",
    [validApiKey, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const stats = await MemoryStats.getSystemStats();

        response.status(200).json({
          success: true,
          health: stats.health,
          summary: {
            workspaces: stats.workspaces.total,
            graphNodes: stats.graph.totalNodes,
            graphEdges: stats.graph.totalEdges,
            recentActivity: stats.conversations.last24Hours,
          },
        });
      } catch (error) {
        console.error("[MemoryStats API] Error getting health:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { memoryStatsEndpoints };
