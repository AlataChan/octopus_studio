/**
 * AI System 管理端点
 * Admin 专属 - 用于监控和配置 LLM Provider、缓存统计等
 */

const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { SystemSettings } = require("../models/systemSettings");
const {
  getRouterStatus,
  selectProvider,
  DEPLOYMENT_REGIONS,
} = require("../utils/AiProviders/providerRouter");
const {
  globalCacheManager,
  CACHE_STRATEGIES,
} = require("../utils/AiProviders/promptCache");
const { toolStats } = require("../utils/agents/toolStats");

/**
 * AI 系统管理端点
 * @param {Express} app - Express 应用实例
 */
function aiSystemEndpoints(app) {
  if (!app) return;

  /**
   * GET /ai-system/status
   * 获取 AI 系统状态概览（Admin 专属）
   */
  app.get(
    "/ai-system/status",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const routerStatus = getRouterStatus();
        const cacheStats = globalCacheManager.getStats();
        const toolStatsData = toolStats.getAllStats();

        // 获取系统设置
        const llmStrategy = await SystemSettings.getValueOrFallback(
          { label: "llm_strategy" },
          "balanced"
        );
        const enhancedIntelligence = await SystemSettings.getValueOrFallback(
          { label: "enhanced_intelligence_global" },
          "false"
        );

        return response.status(200).json({
          success: true,
          data: {
            provider: {
              current: selectProvider({
                enhancedIntelligence: enhancedIntelligence === "true",
              }),
              region: routerStatus.region,
              default: routerStatus.defaultProvider,
              premium: routerStatus.premiumProvider,
              available: routerStatus.availableProviders,
            },
            cache: {
              enabled: globalCacheManager.enabled,
              strategy: globalCacheManager.strategy,
              stats: cacheStats,
            },
            tools: {
              totalCalls: Object.values(toolStatsData).reduce(
                (sum, t) => sum + t.calls,
                0
              ),
              topTools: toolStats.getTopTools(5),
            },
            settings: {
              llmStrategy,
              enhancedIntelligence: enhancedIntelligence === "true",
            },
          },
        });
      } catch (error) {
        console.error("[AI System] Error getting status:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /ai-system/cache-stats
   * 获取详细的缓存统计（Admin 专属）
   */
  app.get(
    "/ai-system/cache-stats",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const stats = globalCacheManager.getStats();
        return response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[AI System] Error getting cache stats:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /ai-system/settings
   * 更新 AI 系统设置（Admin 专属）
   */
  app.post(
    "/ai-system/settings",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { llmStrategy, enhancedIntelligence } = request.body;

        // 验证 llmStrategy
        const validStrategies = ["cost", "balanced", "quality"];
        if (llmStrategy && !validStrategies.includes(llmStrategy)) {
          return response.status(400).json({
            success: false,
            error: `无效的 LLM 策略。有效值: ${validStrategies.join(", ")}`,
          });
        }

        // 更新设置
        if (llmStrategy !== undefined) {
          await SystemSettings.updateSettings({ llm_strategy: llmStrategy });
        }

        if (enhancedIntelligence !== undefined) {
          await SystemSettings.updateSettings({
            enhanced_intelligence_global: String(enhancedIntelligence),
          });
        }

        return response.status(200).json({
          success: true,
          message: "AI 系统设置已更新",
        });
      } catch (error) {
        console.error("[AI System] Error updating settings:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /ai-system/cache/reset
   * 重置缓存统计（Admin 专属）
   */
  app.post(
    "/ai-system/cache/reset",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        globalCacheManager.reset();
        return response.status(200).json({
          success: true,
          message: "缓存统计已重置",
        });
      } catch (error) {
        console.error("[AI System] Error resetting cache:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { aiSystemEndpoints };
