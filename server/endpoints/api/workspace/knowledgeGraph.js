/**
 * 知识图谱 API 路由
 * @module endpoints/api/workspace/knowledgeGraph
 * @description 提供知识图谱的查询、搜索、构建和状态查询功能
 */

const { v4: uuidv4 } = require("uuid");
const { WorkspaceGraph } = require("../../../models/workspaceGraph");
const {
  validatedRequest,
} = require("../../../utils/middleware/validatedRequest");
const {
  validWorkspaceSlug,
} = require("../../../utils/middleware/validWorkspace");
const {
  flexUserRoleValid,
  ROLES,
} = require("../../../utils/middleware/multiUserProtected");
const { reqBody } = require("../../../utils/http");
const prisma = require("../../../utils/prisma");

/**
 * 将内部图谱数据格式转换为前端所需格式
 * @param {Object} subgraph - 内部图谱数据 { nodes, edges }
 * @returns {Object} 前端格式 { nodes, links, stats, pagination }
 */
function transformGraphData(subgraph, totalNodes = null) {
  const { nodes = [], edges = [] } = subgraph;

  // 计算节点度数
  const degreeMap = new Map();
  edges.forEach((edge) => {
    degreeMap.set(edge.fromNodeId, (degreeMap.get(edge.fromNodeId) || 0) + 1);
    degreeMap.set(edge.toNodeId, (degreeMap.get(edge.toNodeId) || 0) + 1);
  });

  // 转换节点格式
  const transformedNodes = nodes.map((node) => ({
    id: node.nodeId,
    name: node.label,
    type: node.type,
    description: node.metadata?.description || null,
    value: 1,
    rank: node.rank || 0,
    degree: degreeMap.get(node.nodeId) || 0,
    lastUpdated: node.updatedAt ? node.updatedAt.toISOString() : null,
    metadata: node.metadata || {},
  }));

  // 转换边格式
  const transformedLinks = edges.map((edge, index) => ({
    id: edge.id ? String(edge.id) : `edge_${index}`,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    type: edge.relation,
    weight: edge.weight || 1,
    metadata: edge.metadata || {},
  }));

  // 计算类型分布
  const typeDistribution = nodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});

  const result = {
    nodes: transformedNodes,
    links: transformedLinks,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      typeDistribution,
    },
  };

  // 添加分页信息
  if (totalNodes !== null && totalNodes > nodes.length) {
    result.pagination = {
      hasMore: true,
      totalNodes,
      message: `显示前 ${nodes.length} 个节点，请使用搜索功能缩小范围`,
    };
  }

  return result;
}

/**
 * 注册知识图谱 API 端点
 * @param {Express} app - Express 应用实例
 */
function knowledgeGraphEndpoints(app) {
  if (!app) return;

  /**
   * GET /workspace/:slug/knowledge-graph
   * 获取知识图谱子图
   */
  app.get(
    "/workspace/:slug/knowledge-graph",
    [validatedRequest, validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { q, limit = 200, types } = request.query;

        // 参数校验
        const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 200), 1000);
        const typeFilter = types ? types.split(",").map((t) => t.trim()) : null;

        let subgraph;
        let totalNodes = null;

        if (q && q.length >= 2) {
          // 关键词搜索模式
          subgraph = await WorkspaceGraph.searchSubgraph({
            workspaceId: workspace.id,
            keyword: q,
            limit: parsedLimit,
          });
        } else {
          // 获取 Top-N 重要节点
          const topNodes = await WorkspaceGraph.getTopNodes(
            workspace.id,
            parsedLimit
          );

          if (topNodes.length === 0) {
            return response.status(200).json({
              success: true,
              data: {
                nodes: [],
                links: [],
                stats: { nodeCount: 0, edgeCount: 0, typeDistribution: {} },
              },
              message: "图谱尚未构建或没有数据",
            });
          }

          // 获取这些节点之间的边
          const nodeIds = topNodes.map((n) => n.nodeId);
          const edges = await WorkspaceGraph.getEdgesBetweenNodes(
            workspace.id,
            nodeIds
          );

          subgraph = { nodes: topNodes, edges };

          // 获取总节点数用于分页提示
          const stats = await WorkspaceGraph.getStats(workspace.id);
          totalNodes = stats.nodeCount;
        }

        // 通用边验证：过滤掉引用不存在节点的边
        const validNodeIds = new Set(subgraph.nodes.map((n) => n.nodeId));
        const originalEdgeCount = subgraph.edges.length;
        subgraph.edges = subgraph.edges.filter(
          (e) => validNodeIds.has(e.fromNodeId) && validNodeIds.has(e.toNodeId)
        );
        if (subgraph.edges.length < originalEdgeCount) {
          console.warn(
            `[KnowledgeGraph] Filtered out ${originalEdgeCount - subgraph.edges.length} edges with missing nodes`
          );
        }

        // 类型过滤
        if (typeFilter && typeFilter.length > 0) {
          subgraph.nodes = subgraph.nodes.filter((n) =>
            typeFilter.includes(n.type)
          );
          const filteredNodeIds = new Set(subgraph.nodes.map((n) => n.nodeId));
          subgraph.edges = subgraph.edges.filter(
            (e) =>
              filteredNodeIds.has(e.fromNodeId) &&
              filteredNodeIds.has(e.toNodeId)
          );
        }

        // 边数限制
        const MAX_EDGES = Math.min(subgraph.nodes.length * 5, 1000);
        if (subgraph.edges.length > MAX_EDGES) {
          subgraph.edges = subgraph.edges
            .sort((a, b) => (b.weight || 0) - (a.weight || 0))
            .slice(0, MAX_EDGES);
        }

        // 转换为前端格式
        const data = transformGraphData(subgraph, totalNodes);

        response.status(200).json({
          success: true,
          data,
        });
      } catch (error) {
        console.error("[KnowledgeGraph] GET /knowledge-graph error:", error);
        response.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message,
          },
        });
      }
    }
  );

  /**
   * GET /workspace/:slug/knowledge-graph/search
   * 搜索节点（轻量级，用于搜索框）
   */
  app.get(
    "/workspace/:slug/knowledge-graph/search",
    [validatedRequest, validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { q, limit = 50 } = request.query;

        if (!q || q.length < 2) {
          return response.status(400).json({
            success: false,
            error: {
              code: "INVALID_QUERY",
              message: "搜索关键词至少需要 2 个字符",
            },
          });
        }

        const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 50), 100);

        const subgraph = await WorkspaceGraph.searchSubgraph({
          workspaceId: workspace.id,
          keyword: q,
          limit: parsedLimit,
        });

        // 仅返回节点列表（不含边）
        const nodes = subgraph.nodes.map((node) => ({
          id: node.nodeId,
          name: node.label,
          type: node.type,
          rank: node.rank || 0,
          metadata: node.metadata || {},
        }));

        response.status(200).json({
          success: true,
          data: {
            nodes,
            total: nodes.length,
          },
        });
      } catch (error) {
        console.error(
          "[KnowledgeGraph] GET /knowledge-graph/search error:",
          error
        );
        response.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message,
          },
        });
      }
    }
  );

  /**
   * POST /workspace/:slug/knowledge-graph/build
   * 触发图谱构建任务
   */
  app.post(
    "/workspace/:slug/knowledge-graph/build",
    [
      validatedRequest,
      validWorkspaceSlug,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { mode = "full", options = {} } = reqBody(request);

        // 检查是否已有进行中的构建任务
        const existingTask = await prisma.workspace_graph_builds.findFirst({
          where: {
            workspaceId: workspace.id,
            status: { in: ["pending", "running"] },
          },
        });

        if (existingTask) {
          return response.status(409).json({
            success: false,
            error: {
              code: "BUILD_IN_PROGRESS",
              message: "已有构建任务正在进行中",
            },
            data: {
              taskId: existingTask.id,
              status: existingTask.status,
              progress: existingTask.progress,
            },
          });
        }

        // 创建构建任务记录
        const taskId = uuidv4();
        const buildOptions = {
          includeDocs: options.includeDocs !== false,
          includeChats: options.includeChats !== false,
          includeEpisodes: options.includeEpisodes !== false,
          computeSimilarity: options.computeSimilarity || false,
        };

        const task = await prisma.workspace_graph_builds.create({
          data: {
            id: taskId,
            workspaceId: workspace.id,
            status: "pending",
            mode: mode === "incremental" ? "incremental" : "full",
            options: JSON.stringify(buildOptions),
            progress: 0,
            message: "任务已创建，等待执行",
            createdBy: response.locals.user?.id || null,
          },
        });

        // 异步触发构建任务
        const {
          WorkspaceGraphBuilder,
        } = require("../../../utils/graphBuilder/workspaceGraphBuilder");
        WorkspaceGraphBuilder.buildAsync({
          workspaceId: workspace.id,
          taskId: task.id,
          mode: task.mode,
          options: buildOptions,
        }).catch((error) => {
          console.error(`[GraphBuild] Task ${task.id} failed:`, error);
        });

        response.status(200).json({
          success: true,
          data: {
            taskId: task.id,
            status: "pending",
            message: "图谱构建任务已创建，请轮询 status 接口查看进度",
          },
        });
      } catch (error) {
        console.error(
          "[KnowledgeGraph] POST /knowledge-graph/build error:",
          error
        );
        response.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message,
          },
        });
      }
    }
  );

  /**
   * GET /workspace/:slug/knowledge-graph/build/status
   * 查询构建任务状态
   */
  app.get(
    "/workspace/:slug/knowledge-graph/build/status",
    [validatedRequest, validWorkspaceSlug],
    async (request, response) => {
      try {
        const workspace = response.locals.workspace;
        const { taskId } = request.query;

        let task;
        if (taskId) {
          task = await prisma.workspace_graph_builds.findUnique({
            where: { id: taskId },
          });
          if (task && task.workspaceId !== workspace.id) {
            return response.status(404).json({
              success: false,
              error: {
                code: "TASK_NOT_FOUND",
                message: "任务不存在或不属于此 Workspace",
              },
            });
          }
        } else {
          task = await prisma.workspace_graph_builds.findFirst({
            where: { workspaceId: workspace.id },
            orderBy: { createdAt: "desc" },
          });
        }

        if (!task) {
          return response.status(200).json({
            success: true,
            data: {
              taskId: null,
              status: "none",
              message: "没有构建任务记录",
            },
          });
        }

        // Stale 检测：超过 24 小时未完成的 running 任务
        let status = task.status;
        let retryable = task.retryable;
        if (task.status === "running") {
          const ageHours =
            (Date.now() - task.updatedAt.getTime()) / (1000 * 60 * 60);
          if (ageHours > 24) {
            status = "stale";
            retryable = true;
          }
        }

        response.status(200).json({
          success: true,
          data: {
            taskId: task.id,
            status,
            progress: task.progress,
            message: task.message,
            nodeCount: task.nodeCount,
            edgeCount: task.edgeCount,
            stats: task.stats ? JSON.parse(task.stats) : null,
            error: task.error ? JSON.parse(task.error) : null,
            retryable,
            startedAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            finishedAt: task.finishedAt ? task.finishedAt.toISOString() : null,
          },
        });
      } catch (error) {
        console.error(
          "[KnowledgeGraph] GET /knowledge-graph/build/status error:",
          error
        );
        response.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message,
          },
        });
      }
    }
  );
}

module.exports = { knowledgeGraphEndpoints, transformGraphData };
