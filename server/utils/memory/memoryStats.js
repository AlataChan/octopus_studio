/**
 * 记忆系统健康度监控
 *
 * Phase 1 任务 4: 记忆健康度监控 API
 *
 * @module utils/memory/memoryStats
 */

const prisma = require("../prisma");

/**
 * 记忆系统统计信息收集器
 */
const MemoryStats = {
  /**
   * 获取系统级记忆统计
   *
   * @returns {Promise<Object>} 系统统计信息
   */
  getSystemStats: async function () {
    try {
      const startTime = Date.now();

      // 并行查询各项统计
      const [
        totalWorkspaces,
        totalGraphNodes,
        totalGraphEdges,
        nodesByType,
        totalChats,
        totalThreads,
        recentActivity,
      ] = await Promise.all([
        // 工作区总数
        prisma.workspaces.count(),

        // 图谱节点总数
        prisma.workspace_graph_nodes.count(),

        // 图谱边总数
        prisma.workspace_graph_edges.count(),

        // 按类型统计节点
        prisma.workspace_graph_nodes.groupBy({
          by: ["type"],
          _count: { type: true },
        }),

        // 聊天记录总数
        prisma.workspace_chats.count(),

        // Thread 总数
        prisma.workspace_threads.count(),

        // 最近 24 小时活动
        prisma.workspace_chats.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      // 转换节点类型统计
      const nodeTypeStats = {};
      for (const item of nodesByType) {
        nodeTypeStats[item.type] = item._count.type;
      }

      const queryTime = Date.now() - startTime;

      return {
        timestamp: new Date().toISOString(),
        queryTimeMs: queryTime,
        workspaces: {
          total: totalWorkspaces,
        },
        graph: {
          totalNodes: totalGraphNodes,
          totalEdges: totalGraphEdges,
          nodesByType: nodeTypeStats,
          avgNodesPerWorkspace:
            totalWorkspaces > 0
              ? Math.round(totalGraphNodes / totalWorkspaces)
              : 0,
        },
        conversations: {
          totalChats: totalChats,
          totalThreads: totalThreads,
          last24Hours: recentActivity,
        },
        health: this._calculateHealthScore({
          totalGraphNodes,
          totalGraphEdges,
          totalChats,
          recentActivity,
        }),
      };
    } catch (error) {
      console.error("[MemoryStats] Error getting system stats:", error);
      throw error;
    }
  },

  /**
   * 获取单个 Workspace 的记忆统计
   *
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<Object>} Workspace 统计信息
   */
  getWorkspaceStats: async function (workspaceId) {
    try {
      const startTime = Date.now();

      const [
        graphNodes,
        graphEdges,
        nodesByType,
        chatCount,
        threadCount,
        documentCount,
        recentChats,
      ] = await Promise.all([
        prisma.workspace_graph_nodes.count({
          where: { workspaceId },
        }),

        prisma.workspace_graph_edges.count({
          where: { workspaceId },
        }),

        prisma.workspace_graph_nodes.groupBy({
          by: ["type"],
          where: { workspaceId },
          _count: { type: true },
        }),

        prisma.workspace_chats.count({
          where: { workspaceId },
        }),

        prisma.workspace_threads.count({
          where: { workspaceId },
        }),

        prisma.workspace_documents.count({
          where: { workspaceId },
        }),

        prisma.workspace_chats.count({
          where: {
            workspaceId,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      const nodeTypeStats = {};
      for (const item of nodesByType) {
        nodeTypeStats[item.type] = item._count.type;
      }

      return {
        workspaceId,
        timestamp: new Date().toISOString(),
        queryTimeMs: Date.now() - startTime,
        graph: {
          nodes: graphNodes,
          edges: graphEdges,
          nodesByType: nodeTypeStats,
        },
        content: {
          chats: chatCount,
          threads: threadCount,
          documents: documentCount,
          recentChats24h: recentChats,
        },
      };
    } catch (error) {
      console.error("[MemoryStats] Error getting workspace stats:", error);
      throw error;
    }
  },

  /**
   * 计算健康度评分
   *
   * @param {Object} metrics - 指标数据
   * @returns {Object} 健康度评分
   * @private
   */
  _calculateHealthScore: function (metrics) {
    const { totalGraphNodes, totalGraphEdges, totalChats, recentActivity } =
      metrics;

    // 评分维度
    const scores = {
      // 图谱丰富度 (0-100)
      graphRichness: Math.min(
        100,
        (totalGraphNodes / 100) * 50 + (totalGraphEdges / 200) * 50
      ),

      // 活跃度 (0-100)
      activity: Math.min(100, (recentActivity / 10) * 100),

      // 数据量 (0-100)
      dataVolume: Math.min(100, (totalChats / 1000) * 100),
    };

    // 综合评分
    const overall = Math.round(
      scores.graphRichness * 0.4 +
        scores.activity * 0.3 +
        scores.dataVolume * 0.3
    );

    // 健康状态
    let status = "healthy";
    if (overall < 30) status = "needs_attention";
    else if (overall < 60) status = "moderate";

    return {
      overall,
      status,
      dimensions: {
        graphRichness: Math.round(scores.graphRichness),
        activity: Math.round(scores.activity),
        dataVolume: Math.round(scores.dataVolume),
      },
      recommendations: this._generateRecommendations(scores),
    };
  },

  /**
   * 生成改进建议
   *
   * @param {Object} scores - 各维度评分
   * @returns {string[]} 建议列表
   * @private
   */
  _generateRecommendations: function (scores) {
    const recommendations = [];

    if (scores.graphRichness < 30) {
      recommendations.push("建议上传更多文档以丰富知识图谱");
    }

    if (scores.activity < 30) {
      recommendations.push("系统活跃度较低，建议增加使用频率");
    }

    if (scores.dataVolume < 30) {
      recommendations.push("数据量较少，建议积累更多对话历史");
    }

    if (recommendations.length === 0) {
      recommendations.push("记忆系统运行良好");
    }

    return recommendations;
  },
};

module.exports = { MemoryStats };
