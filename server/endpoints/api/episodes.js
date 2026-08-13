/**
 * Episode API 端点
 *
 * Phase 1 任务 1: Episode 作为 Graph Node
 *
 * @module endpoints/api/episodes
 */

const { validApiKey } = require("../../utils/middleware/validApiKey");
const { Workspace } = require("../../models/workspace");
const { EpisodeManager } = require("../../utils/memory/episodeManager");

/**
 * 注册 Episode 相关的 API 端点
 * @param {Express} app - Express 应用实例
 */
function episodeEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/v1/workspace/:slug/episodes
   * 获取 Workspace 下的所有 Episode
   */
  app.get(
    "/v1/workspace/:slug/episodes",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { status } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const episodes = await EpisodeManager.getEpisodes({
          workspaceId: workspace.id,
          status: status || null,
        });

        response.status(200).json({
          success: true,
          episodes,
        });
      } catch (error) {
        console.error("[Episodes API] Error getting episodes:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/workspace/:slug/episodes/:episodeId
   * 获取单个 Episode 详情
   */
  app.get(
    "/v1/workspace/:slug/episodes/:episodeId",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, episodeId } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const episode = await EpisodeManager.getEpisode({
          workspaceId: workspace.id,
          episodeId,
        });

        if (!episode) {
          return response.status(404).json({
            success: false,
            error: "Episode not found",
          });
        }

        response.status(200).json({
          success: true,
          episode,
        });
      } catch (error) {
        console.error("[Episodes API] Error getting episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/workspace/:slug/episodes
   * 创建新的 Episode
   */
  app.post(
    "/v1/workspace/:slug/episodes",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { name, description, tags } = request.body;

        if (!name || name.trim() === "") {
          return response.status(400).json({
            success: false,
            error: "Episode name is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const userId = request.user?.id || null;

        const episode = await EpisodeManager.createEpisode({
          workspaceId: workspace.id,
          name: name.trim(),
          description: description || "",
          tags: tags || [],
          userId,
        });

        response.status(201).json({
          success: true,
          episode,
        });
      } catch (error) {
        console.error("[Episodes API] Error creating episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * PATCH /api/v1/workspace/:slug/episodes/:episodeId
   * 更新 Episode
   */
  app.patch(
    "/v1/workspace/:slug/episodes/:episodeId",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, episodeId } = request.params;
        const updates = request.body;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const episode = await EpisodeManager.updateEpisode({
          workspaceId: workspace.id,
          episodeId,
          updates,
        });

        if (!episode) {
          return response.status(404).json({
            success: false,
            error: "Episode not found",
          });
        }

        response.status(200).json({
          success: true,
          episode,
        });
      } catch (error) {
        console.error("[Episodes API] Error updating episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/v1/workspace/:slug/episodes/:episodeId
   * 删除 Episode
   */
  app.delete(
    "/v1/workspace/:slug/episodes/:episodeId",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, episodeId } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const success = await EpisodeManager.deleteEpisode({
          workspaceId: workspace.id,
          episodeId,
        });

        if (!success) {
          return response.status(404).json({
            success: false,
            error: "Episode not found or could not be deleted",
          });
        }

        response.status(200).json({
          success: true,
          message: "Episode deleted successfully",
        });
      } catch (error) {
        console.error("[Episodes API] Error deleting episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/workspace/:slug/episodes/:episodeId/link
   * 将聊天/文档关联到 Episode
   */
  app.post(
    "/v1/workspace/:slug/episodes/:episodeId/link",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, episodeId } = request.params;
        const { targetNodeId } = request.body;

        if (!targetNodeId) {
          return response.status(400).json({
            success: false,
            error: "targetNodeId is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const success = await EpisodeManager.linkToEpisode({
          workspaceId: workspace.id,
          episodeId,
          targetNodeId,
        });

        response.status(200).json({
          success,
          message: success ? "Linked successfully" : "Failed to link",
        });
      } catch (error) {
        console.error("[Episodes API] Error linking to episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/workspace/:slug/episodes/:episodeId/unlink
   * 从 Episode 取消关联
   */
  app.post(
    "/v1/workspace/:slug/episodes/:episodeId/unlink",
    [validApiKey],
    async (request, response) => {
      try {
        const { slug, episodeId } = request.params;
        const { targetNodeId } = request.body;

        if (!targetNodeId) {
          return response.status(400).json({
            success: false,
            error: "targetNodeId is required",
          });
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const success = await EpisodeManager.unlinkFromEpisode({
          workspaceId: workspace.id,
          episodeId,
          targetNodeId,
        });

        response.status(200).json({
          success,
          message: success ? "Unlinked successfully" : "Failed to unlink",
        });
      } catch (error) {
        console.error("[Episodes API] Error unlinking from episode:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { episodeEndpoints };
