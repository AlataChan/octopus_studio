/**
 * Workspace 知识图谱 API 端点
 *
 * 提供图谱数据的查询、搜索和统计接口
 */

const { WorkspaceGraph } = require("../models/workspaceGraph");
const { Workspace } = require("../models/workspace");
const { multiUserMode, reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

function workspaceGraphEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/workspace/:slug/graph/stats
   * 获取图谱统计信息
   */
  app.get(
    "/workspace/:slug/graph/stats",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
          return;
        }

        const stats = await WorkspaceGraph.getStats(workspace.id);

        response.status(200).json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error("[WorkspaceGraph API] Error getting stats:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/graph/overview
   * 获取图谱概览 (采样图)
   *
   * Query params:
   * - limit: 最大节点数 (默认 50)
   */
  app.get(
    "/workspace/:slug/graph/overview",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const limit = parseInt(request.query.limit || "50");

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
          return;
        }

        // 获取所有节点 (按 rank 排序,取前 N 个)
        const nodes = await WorkspaceGraph.getTopNodes(workspace.id, limit);

        // 获取这些节点之间的边
        const nodeIds = nodes.map((n) => n.nodeId);
        const edges = await WorkspaceGraph.getEdgesBetweenNodes(
          workspace.id,
          nodeIds
        );

        response.status(200).json({
          success: true,
          data: {
            nodes,
            edges,
          },
        });
      } catch (error) {
        console.error("[WorkspaceGraph API] Error getting overview:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/graph/search
   * 搜索图谱节点
   *
   * Query params:
   * - keyword: 搜索关键词
   * - limit: 最大节点数 (默认 30)
   */
  app.get(
    "/workspace/:slug/graph/search",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { keyword, limit = "30" } = request.query;

        if (!keyword) {
          response
            .status(400)
            .json({ success: false, error: "Keyword is required" });
          return;
        }

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
          return;
        }

        const subgraph = await WorkspaceGraph.searchSubgraph({
          workspaceId: workspace.id,
          keyword,
          limit: parseInt(limit),
        });

        response.status(200).json({
          success: true,
          data: subgraph,
        });
      } catch (error) {
        console.error("[WorkspaceGraph API] Error searching graph:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/graph/node/:nodeId
   * 获取节点的局部子图
   *
   * Query params:
   * - depth: BFS 深度 (默认 1)
   */
  app.get(
    "/workspace/:slug/graph/node/:nodeId",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, nodeId } = request.params;
        const depth = parseInt(request.query.depth || "1");

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          response
            .status(404)
            .json({ success: false, error: "Workspace not found" });
          return;
        }

        const subgraph = await WorkspaceGraph.getSubgraphByNode({
          workspaceId: workspace.id,
          nodeId,
          depth,
        });

        response.status(200).json({
          success: true,
          data: subgraph,
        });
      } catch (error) {
        console.error(
          "[WorkspaceGraph API] Error getting node subgraph:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { workspaceGraphEndpoints };
