/**
 * 手动记忆 API 端点
 *
 * Phase 1 任务 3: 用户触发「记住」功能
 *
 * @module endpoints/api/memories
 */

const { validatedRequest } = require("../../utils/middleware/validatedRequest");
const { Workspace } = require("../../models/workspace");
const { userFromSession } = require("../../utils/http");
const { User } = require("../../models/user");
const {
  ManualMemory,
  MEMORY_TYPES,
} = require("../../utils/memory/manualMemory");
const { PIIFilter, PII_TYPES } = require("../../utils/memory/piiFilter");

/**
 * 从请求中获取用户（支持 Session Token 和 API Key 两种方式）
 */
async function getUserFromRequest(request, response) {
  const sessionUser = await userFromSession(request, response);
  if (sessionUser) return sessionUser;

  const apiKey = response.locals.apiKey;
  if (apiKey && apiKey.createdBy) {
    const user = await User.get({ id: apiKey.createdBy });
    if (user) return user;
  }

  if (response.locals.multiUserMode) return null;
  return { id: 1 };
}

/**
 * 注册记忆相关的 API 端点
 * @param {Express} app - Express 应用实例
 */
function memoriesEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/v1/workspace/:slug/memories
   * 获取 Workspace 的所有手动记忆
   */
  app.get(
    "/v1/workspace/:slug/memories",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { type, limit } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const memories = await ManualMemory.getMemories({
          workspaceId: workspace.id,
          type: type || null,
          limit: parseInt(limit) || 50,
        });

        response.status(200).json({
          success: true,
          memories,
        });
      } catch (error) {
        console.error("[Memories API] Error getting memories:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/workspace/:slug/memories
   * 保存新的记忆（「记住」功能）
   *
   * Phase 2: 支持 PII 检测和脱敏
   * - sanitize: "auto" | "confirm" | "skip" (默认 "confirm")
   * - 当 sanitize="confirm" 且检测到 PII 时，返回 needsConfirmation: true
   */
  app.post(
    "/v1/workspace/:slug/memories",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const {
          content,
          type,
          tags,
          sourceMessageId,
          sanitize = "confirm",
        } = request.body;

        // 调试日志
        console.log("[Memories API] POST /memories - slug:", slug);
        console.log(
          "[Memories API] Body:",
          JSON.stringify({
            content: content?.substring?.(0, 50),
            type,
            sanitize,
          })
        );

        if (!content || content.trim() === "") {
          console.error(
            "[Memories API] Content is empty or missing. Body:",
            JSON.stringify(request.body)
          );
          return response.status(400).json({
            success: false,
            error: "Memory content is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const user = await getUserFromRequest(request, response);
        const trimmedContent = content.trim();

        // Phase 2: PII 检测
        const detected = PIIFilter.detect(trimmedContent);

        // 如果检测到 PII 且需要确认
        if (detected.length > 0 && sanitize === "confirm") {
          const { sanitized } = PIIFilter.sanitize(trimmedContent);
          return response.status(200).json({
            success: false,
            needsConfirmation: true,
            detected: detected.map((d) => ({
              type: d.type,
              preview: d.value.slice(0, 4) + "****",
            })),
            sanitizedPreview:
              sanitized.slice(0, 200) + (sanitized.length > 200 ? "..." : ""),
            message: "检测到敏感信息，请确认处理方式",
          });
        }

        // 根据 sanitize 参数处理内容
        let finalContent = trimmedContent;
        let wasSanitized = false;

        if (sanitize === "auto" && detected.length > 0) {
          const { sanitized } = PIIFilter.sanitize(trimmedContent);
          finalContent = sanitized;
          wasSanitized = true;
        }

        const memory = await ManualMemory.saveMemory({
          workspaceId: workspace.id,
          content: finalContent,
          type: type || MEMORY_TYPES.CUSTOM,
          tags: tags || [],
          userId: user?.id || null,
          sourceMessageId: sourceMessageId || null,
        });

        response.status(201).json({
          success: true,
          memory,
          wasSanitized,
          message: wasSanitized ? "记忆已脱敏保存" : "记忆已保存",
        });
      } catch (error) {
        console.error("[Memories API] Error saving memory:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/workspace/:slug/memories/check-pii
   * 检测文本中的 PII（不保存）
   */
  app.post(
    "/v1/workspace/:slug/memories/check-pii",
    [validatedRequest],
    async (request, response) => {
      try {
        const { content } = request.body;

        if (!content) {
          return response.status(400).json({
            success: false,
            error: "Content is required",
          });
        }

        const detected = PIIFilter.detect(content);
        const hasPII = detected.length > 0;

        let sanitizedPreview = null;
        if (hasPII) {
          const { sanitized } = PIIFilter.sanitize(content);
          sanitizedPreview = sanitized;
        }

        response.status(200).json({
          success: true,
          hasPII,
          detected: detected.map((d) => ({
            type: d.type,
            preview: d.value.slice(0, 4) + "****",
          })),
          sanitizedPreview,
          piiTypes: PII_TYPES,
        });
      } catch (error) {
        console.error("[Memories API] Error checking PII:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/v1/workspace/:slug/memories/:memoryId
   * 删除记忆
   */
  app.delete(
    "/v1/workspace/:slug/memories/:memoryId",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, memoryId } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const success = await ManualMemory.deleteMemory({
          workspaceId: workspace.id,
          memoryId,
        });

        if (!success) {
          return response.status(404).json({
            success: false,
            error: "Memory not found or could not be deleted",
          });
        }

        response.status(200).json({
          success: true,
          message: "记忆已删除",
        });
      } catch (error) {
        console.error("[Memories API] Error deleting memory:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/workspace/:slug/memories/search
   * 搜索记忆
   */
  app.get(
    "/v1/workspace/:slug/memories/search",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { q, limit } = request.query;

        if (!q || q.trim() === "") {
          return response.status(400).json({
            success: false,
            error: "Search query is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const memories = await ManualMemory.searchMemories({
          workspaceId: workspace.id,
          query: q.trim(),
          limit: parseInt(limit) || 20,
        });

        response.status(200).json({
          success: true,
          memories,
          query: q.trim(),
        });
      } catch (error) {
        console.error("[Memories API] Error searching memories:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/workspace/:slug/memories/types
   * 获取记忆类型定义
   */
  app.get(
    "/v1/workspace/:slug/memories/types",
    [validatedRequest],
    async (_request, response) => {
      try {
        response.status(200).json({
          success: true,
          types: MEMORY_TYPES,
        });
      } catch (error) {
        console.error("[Memories API] Error getting types:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { memoriesEndpoints };
