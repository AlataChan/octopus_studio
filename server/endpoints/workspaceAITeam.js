const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { Workspace } = require("../models/workspace");
const { WorkspaceGraph } = require("../models/workspaceGraph");
const { WorkspaceAssistant } = require("../models/workspaceAssistant");
const { PerformanceStatsService } = require("../utils/performanceStats");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const { InvocationStep } = require("../models/invocationStep");

/**
 * AI 团队视图 API
 * 用于展示 Workspace 中的 AI 员工组织架构
 */
function workspaceAITeamEndpoints(app) {
  if (!app) return;

  /**
   * GET /api/workspace/:slug/ai-team/overview
   * 获取 AI 团队概览
   */
  app.get(
    "/workspace/:slug/ai-team/overview",
    [validatedRequest],
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

        // 获取图谱数据（用于统计 chat 和 document 边）
        const graphData = await WorkspaceGraph.getFullGraph({
          workspaceId: workspace.id,
        });

        // 以 workspace_assistants 表为主数据源（确保与侧边栏数据一致）
        const workspaceAssistants = await WorkspaceAssistant.listByWorkspace(
          workspace.id
        );

        // 创建图谱节点映射（用于获取 metadata 和统计数据）
        const graphNodeMap = new Map(
          graphData.nodes
            .filter((node) => node.type === "assistant")
            .map((node) => [node.externalId, node])
        );

        // 统计每个助手的使用情况
        const assistantStats = workspaceAssistants.map((assistant) => {
          const graphNode = graphNodeMap.get(assistant.id);
          const metadata = graphNode?.metadata || {};
          const nodeId = graphNode?.nodeId || `assistant:${assistant.id}`;

          // 统计 assistant → chat 边的数量
          const chatEdges = graphData.edges.filter(
            (edge) =>
              edge.fromNodeId === nodeId && edge.relation === "assistant"
          );

          // 统计 assistant → document 边的数量
          const docEdges = graphData.edges.filter(
            (edge) =>
              edge.fromNodeId === nodeId && edge.relation === "reference"
          );

          // 统一名称字段：
          // - name: 功能名称（如"长文协作助手"）
          // - employeeName: 人格名称（如"露娜 Luna"）
          // - employeeTitle: 岗位名称（如"首席营销官 CMO"）
          // - instanceName: 自定义实例名称（用户可覆盖）
          return {
            id: assistant.id,
            nodeId: nodeId,
            // 功能名称（用于团队页面主显示）
            name: assistant.template?.name || "未命名助手",
            // 人格名称（用于人才市场）
            employeeName: assistant.template?.employeeName || null,
            // 岗位名称（用于徽章显示）
            employeeTitle: assistant.template?.employeeTitle || null,
            // 自定义实例名称（用户覆盖）
            instanceName: assistant.instanceName || null,
            category:
              metadata.category || assistant.template?.category || "未分类",
            tags: metadata.tags || assistant.template?.tags || [],
            platformType:
              metadata.platformType || assistant.template?.platformType || null,
            knowledgeMode: metadata.knowledgeMode || "workspace",
            skills: metadata.skills || assistant.template?.skills || [],
            source: assistant.source || "hired", // 员工来源：hired | default | custom
            chatCount: chatEdges.length,
            documentCount: docEdges.length,
            rank: graphNode?.rank || 0,
          };
        });

        return response.status(200).json({
          success: true,
          data: {
            workspace: {
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
            },
            assistants: assistantStats,
            totalAssistants: assistantStats.length,
            totalChats: assistantStats.reduce((sum, a) => sum + a.chatCount, 0),
            totalDocuments: assistantStats.reduce(
              (sum, a) => sum + a.documentCount,
              0
            ),
          },
        });
      } catch (error) {
        console.error("[AI Team] Error getting overview:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/graph
   * 获取 AI 团队图谱数据 (用于可视化)
   */
  app.get(
    "/workspace/:slug/ai-team/graph",
    [validatedRequest],
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

        // 【M6】创建助手协作边（如果还没有）
        await WorkspaceGraph.createAssistantCollaborationEdges(workspace.id);

        // 获取完整图谱
        const graphData = await WorkspaceGraph.getFullGraph({
          workspaceId: workspace.id,
        });

        // 过滤出与 assistant 相关的节点和边
        const assistantNodeIds = new Set(
          graphData.nodes
            .filter((node) => node.type === "assistant")
            .map((node) => node.nodeId)
        );

        // 获取所有与 assistant 相关的边
        const relevantEdges = graphData.edges.filter(
          (edge) =>
            assistantNodeIds.has(edge.fromNodeId) ||
            assistantNodeIds.has(edge.toNodeId)
        );

        // 获取所有相关节点的 ID
        const relevantNodeIds = new Set(assistantNodeIds);
        relevantEdges.forEach((edge) => {
          relevantNodeIds.add(edge.fromNodeId);
          relevantNodeIds.add(edge.toNodeId);
        });

        // 过滤出相关节点
        const relevantNodes = graphData.nodes.filter((node) =>
          relevantNodeIds.has(node.nodeId)
        );

        return response.status(200).json({
          success: true,
          data: {
            nodes: relevantNodes,
            edges: relevantEdges,
          },
        });
      } catch (error) {
        console.error("[AI Team] Error getting graph:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/performance
   * 获取 AI 员工性能统计
   *
   * @query {string} [period='7d'] - 时间周期: '24h', '7d', '30d'
   * @query {string} [assistantId] - 可选，筛选特定助手
   */
  app.get(
    "/workspace/:slug/ai-team/performance",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { period = "7d", assistantId } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        // 验证 period 参数
        const validPeriods = ["24h", "7d", "30d"];
        if (!validPeriods.includes(period)) {
          return response.status(400).json({
            success: false,
            error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
          });
        }

        const stats = await PerformanceStatsService.getWorkspaceStats({
          workspaceId: workspace.id,
          assistantId: assistantId || undefined,
          period,
        });

        return response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[AI Team] Error getting performance stats:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/assistant/:assistantId/performance
   * 获取单个助手的详细性能统计
   *
   * @param {string} assistantId - 助手 ID
   * @query {string} [period='7d'] - 时间周期
   */
  app.get(
    "/workspace/:slug/ai-team/assistant/:assistantId/performance",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, assistantId } = request.params;
        const { period = "7d" } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        // 验证 period 参数
        const validPeriods = ["24h", "7d", "30d"];
        if (!validPeriods.includes(period)) {
          return response.status(400).json({
            success: false,
            error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
          });
        }

        const stats = await PerformanceStatsService.getAssistantStats({
          assistantId,
          period,
        });

        return response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[AI Team] Error getting assistant performance:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/assistant/:assistantId/invocations
   * 获取指定助手的调用历史
   */
  app.get(
    "/workspace/:slug/ai-team/assistant/:assistantId/invocations",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, assistantId } = request.params;
        const { limit = "20", offset = "0" } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const result = await WorkspaceAgentInvocation.getByAssistant({
          workspaceId: workspace.id,
          assistantId,
          limit: parseInt(limit),
          offset: parseInt(offset),
        });

        return response.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[AI Team] Error getting invocation history:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/invocations/:invocationId
   * 获取单次调用的详情（包含步骤）
   */
  app.get(
    "/workspace/:slug/ai-team/invocations/:invocationId",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug, invocationId } = request.params;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        const invocation =
          await WorkspaceAgentInvocation.getWithSteps(invocationId);

        if (!invocation) {
          return response.status(404).json({
            success: false,
            error: "Invocation not found",
          });
        }

        // 验证调用属于当前 workspace
        if (invocation.workspace?.id !== workspace.id) {
          return response.status(403).json({
            success: false,
            error: "Access denied",
          });
        }

        return response.status(200).json({
          success: true,
          data: invocation,
        });
      } catch (error) {
        console.error("[AI Team] Error getting invocation details:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/invocations/:invocationId/steps
   * 获取单次调用的步骤列表
   */
  app.get(
    "/workspace/:slug/ai-team/invocations/:invocationId/steps",
    [validatedRequest],
    async (request, response) => {
      try {
        const { invocationId } = request.params;

        const steps = await InvocationStep.getByInvocationId(
          parseInt(invocationId)
        );

        return response.status(200).json({
          success: true,
          data: { steps },
        });
      } catch (error) {
        console.error("[AI Team] Error getting invocation steps:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/workspace/:slug/ai-team/collaboration-graph
   * 获取增强版协作图谱（包含共用会话关系、活跃度、来源等）
   *
   * @query {string} [period='7d'] - 统计周期: '24h', '7d', '30d'
   */
  app.get(
    "/workspace/:slug/ai-team/collaboration-graph",
    [validatedRequest],
    async (request, response) => {
      try {
        const { slug } = request.params;
        const { period = "7d" } = request.query;

        const workspace = await Workspace.get({ slug });
        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: "Workspace not found",
          });
        }

        // 1. 获取所有助手及其基本信息
        const assistants = await WorkspaceAssistant.listByWorkspace(
          workspace.id
        );

        // 2. 计算时间范围
        const periodMap = { "24h": 1, "7d": 7, "30d": 30 };
        const days = periodMap[period] || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // 3. 获取调用统计
        const invocationStats =
          await WorkspaceAgentInvocation.getCollaborationStats({
            workspaceId: workspace.id,
            startDate,
          });

        // 4. 构建节点数据（增强版）
        const nodes = assistants.map((assistant) => {
          const stats = invocationStats.assistantStats[assistant.id] || {
            totalInvocations: 0,
            successCount: 0,
            lastUsedAt: null,
          };

          // 计算活跃度分数 (0-100)
          const maxInvocations = Math.max(
            ...Object.values(invocationStats.assistantStats).map(
              (s) => s.totalInvocations
            ),
            1
          );
          const activityScore = Math.round(
            (stats.totalInvocations / maxInvocations) * 100
          );

          return {
            id: `assistant:${assistant.id}`,
            assistantId: assistant.id,
            name:
              assistant.instanceName ||
              assistant.template?.name ||
              "未命名助手",
            category: assistant.template?.category || "通用",
            source: assistant.source || "hired",
            activityScore,
            invocationCount: stats.totalInvocations,
            successCount: stats.successCount,
            successRate:
              stats.totalInvocations > 0
                ? Math.round(
                    (stats.successCount / stats.totalInvocations) * 100
                  ) / 100
                : 0,
            lastUsedAt: stats.lastUsedAt,
            avatar: assistant.template?.icon || null,
            tags: assistant.template?.tags || [],
          };
        });

        // 5. 构建协作边（基于共用会话）
        const edges = [];
        const collaborations = invocationStats.collaborations || [];

        collaborations.forEach((collab) => {
          edges.push({
            from: `assistant:${collab.assistant1}`,
            to: `assistant:${collab.assistant2}`,
            relation: "co_session",
            weight: collab.sharedThreads,
            coOccurrenceCount: collab.coOccurrenceCount,
            lastCoOccurrence: collab.lastCoOccurrence,
          });
        });

        // 6. 统计信息
        const stats = {
          totalCollaborations: edges.length,
          totalInvocations: Object.values(
            invocationStats.assistantStats
          ).reduce((sum, s) => sum + s.totalInvocations, 0),
          period,
        };

        return response.status(200).json({
          success: true,
          data: {
            nodes,
            edges,
            stats,
          },
        });
      } catch (error) {
        console.error("[AI Team] Error getting collaboration graph:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { workspaceAITeamEndpoints };
