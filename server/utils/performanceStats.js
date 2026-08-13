const { InvocationStep } = require("../models/invocationStep");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const prisma = require("./prisma");

/**
 * AI员工性能统计服务
 *
 * @description
 * 聚合 workspace_agent_invocations 和 workspace_agent_invocation_steps 数据
 * 提供 AI 员工的性能指标统计
 */
const PerformanceStatsService = {
  /**
   * 获取 Workspace 级别的 AI 员工性能统计
   * @param {Object} options - 查询选项
   * @param {number} options.workspaceId - Workspace ID
   * @param {string} [options.assistantId] - 助手 ID (可选，用于筛选特定助手)
   * @param {string} [options.period='7d'] - 时间周期: '24h', '7d', '30d'
   * @returns {Promise<Object>} 性能统计数据
   */
  getWorkspaceStats: async function ({
    workspaceId,
    assistantId,
    period = "7d",
  }) {
    const startDate = this._getStartDate(period);
    const endDate = new Date();

    try {
      // 构建查询条件
      const whereClause = {
        workspace_id: workspaceId,
        createdAt: { gte: startDate, lte: endDate },
        closed: true,
      };
      if (assistantId) whereClause.assistant_id = assistantId;

      // 并行获取各项统计
      const [invocationStats, toolStats, assistantBreakdown, dailyTrend] =
        await Promise.all([
          this._getInvocationStats(whereClause),
          InvocationStep.getToolStats({ startDate, endDate, limit: 10 }),
          this._getAssistantBreakdown(whereClause),
          this._getDailyTrend(whereClause, period),
        ]);

      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: invocationStats,
        topTools: toolStats,
        assistantBreakdown,
        dailyTrend,
      };
    } catch (error) {
      console.error(
        "[PerformanceStatsService] getWorkspaceStats failed:",
        error.message
      );
      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: { total: 0, successful: 0, failed: 0, successRate: 0 },
        topTools: [],
        assistantBreakdown: [],
        dailyTrend: [],
      };
    }
  },

  /**
   * 获取单个助手的详细性能统计
   * @param {Object} options - 查询选项
   * @param {string} options.assistantId - 助手 ID
   * @param {string} [options.period='7d'] - 时间周期
   * @returns {Promise<Object>} 助手性能统计
   */
  getAssistantStats: async function ({ assistantId, period = "7d" }) {
    const startDate = this._getStartDate(period);
    const endDate = new Date();

    try {
      const whereClause = {
        assistant_id: assistantId,
        createdAt: { gte: startDate, lte: endDate },
        closed: true,
      };

      const [invocationStats, recentInvocations] = await Promise.all([
        this._getInvocationStats(whereClause),
        this._getRecentInvocations(assistantId, 10),
      ]);

      return {
        assistantId,
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: invocationStats,
        recentInvocations,
      };
    } catch (error) {
      console.error(
        "[PerformanceStatsService] getAssistantStats failed:",
        error.message
      );
      return {
        assistantId,
        period,
        summary: { total: 0, successful: 0, failed: 0, successRate: 0 },
        recentInvocations: [],
      };
    }
  },

  /**
   * 获取调用统计（含平均响应时间和知识指标）
   * @private
   */
  _getInvocationStats: async function (whereClause) {
    const [total, successful, failed, invocationsWithTime, knowledgeStats] =
      await Promise.all([
        prisma.workspace_agent_invocations.count({ where: whereClause }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, success: true },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...whereClause, success: false },
        }),
        // 获取所有已完成调用，用于计算平均响应时间
        prisma.workspace_agent_invocations.findMany({
          where: { ...whereClause, success: true },
          select: { createdAt: true, lastUpdatedAt: true },
        }),
        // 获取知识覆盖相关统计
        this._getKnowledgeStats(whereClause),
      ]);

    // 计算平均响应时间（毫秒）
    let avgResponseTimeMs = 0;
    if (invocationsWithTime.length > 0) {
      const totalMs = invocationsWithTime.reduce((sum, inv) => {
        const responseTime =
          inv.lastUpdatedAt.getTime() - inv.createdAt.getTime();
        return sum + Math.max(0, responseTime); // 避免负数
      }, 0);
      avgResponseTimeMs = Math.round(totalMs / invocationsWithTime.length);
    }

    return {
      total,
      successful,
      failed,
      pending: total - successful - failed, // success 为 null 的记录
      successRate: total > 0 ? Number((successful / total).toFixed(2)) : 0,
      avgResponseTimeMs,
      completedThisWeek: successful, // 本周完成的任务数（success=true）
      knowledge: knowledgeStats,
    };
  },

  /**
   * 获取知识覆盖相关统计
   * @private
   */
  _getKnowledgeStats: async function (whereClause) {
    try {
      // 获取有知识指标的调用
      const knowledgeWhereClause = {
        ...whereClause,
        knowledge_coverage: { not: null },
      };

      const [
        knowledgeTotal,
        lowCoverage,
        mediumCoverage,
        highCoverage,
        avgMetrics,
      ] = await Promise.all([
        prisma.workspace_agent_invocations.count({
          where: knowledgeWhereClause,
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...knowledgeWhereClause, knowledge_coverage: "low" },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...knowledgeWhereClause, knowledge_coverage: "medium" },
        }),
        prisma.workspace_agent_invocations.count({
          where: { ...knowledgeWhereClause, knowledge_coverage: "high" },
        }),
        prisma.workspace_agent_invocations.aggregate({
          where: knowledgeWhereClause,
          _avg: {
            graph_nodes_used: true,
            vector_sources_used: true,
            planning_duration_ms: true,
          },
        }),
      ]);

      return {
        enabled: knowledgeTotal > 0,
        totalWithKnowledge: knowledgeTotal,
        coverageDistribution: {
          low: lowCoverage,
          medium: mediumCoverage,
          high: highCoverage,
        },
        averages: {
          graphNodesUsed: Math.round(avgMetrics._avg?.graph_nodes_used || 0),
          vectorSourcesUsed: Math.round(
            avgMetrics._avg?.vector_sources_used || 0
          ),
          planningDurationMs: Math.round(
            avgMetrics._avg?.planning_duration_ms || 0
          ),
        },
      };
    } catch (error) {
      console.error(
        "[PerformanceStatsService] _getKnowledgeStats failed:",
        error.message
      );
      return {
        enabled: false,
        totalWithKnowledge: 0,
        coverageDistribution: { low: 0, medium: 0, high: 0 },
        averages: {
          graphNodesUsed: 0,
          vectorSourcesUsed: 0,
          planningDurationMs: 0,
        },
      };
    }
  },

  /**
   * 获取助手分布统计
   * @private
   */
  _getAssistantBreakdown: async function (whereClause) {
    const breakdown = await prisma.workspace_agent_invocations.groupBy({
      by: ["assistant_id"],
      where: whereClause,
      _count: { id: true },
    });

    // 获取助手名称
    const assistantIds = breakdown
      .map((b) => b.assistant_id)
      .filter((id) => id !== null);

    const assistants =
      assistantIds.length > 0
        ? await prisma.assistant_templates.findMany({
            where: { id: { in: assistantIds } },
            select: { id: true, name: true },
          })
        : [];

    const assistantMap = new Map(assistants.map((a) => [a.id, a.name]));

    return breakdown.map((b) => ({
      assistantId: b.assistant_id,
      assistantName: assistantMap.get(b.assistant_id) || "未知助手",
      invocationCount: b._count.id,
    }));
  },

  /**
   * 获取每日趋势
   * @private
   */
  _getDailyTrend: async function (whereClause, _period) {
    // SQLite 不支持 DATE_TRUNC，需要在应用层处理
    const invocations = await prisma.workspace_agent_invocations.findMany({
      where: whereClause,
      select: { createdAt: true, success: true },
      orderBy: { createdAt: "asc" },
    });

    // 按日期分组
    const dailyMap = new Map();
    for (const inv of invocations) {
      const dateKey = inv.createdAt.toISOString().split("T")[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { total: 0, successful: 0, failed: 0 });
      }
      const day = dailyMap.get(dateKey);
      day.total++;
      if (inv.success === true) day.successful++;
      else if (inv.success === false) day.failed++;
    }

    return Array.from(dailyMap.entries()).map(([date, stats]) => ({
      date,
      ...stats,
      successRate:
        stats.total > 0
          ? Number((stats.successful / stats.total).toFixed(2))
          : 0,
    }));
  },

  /**
   * 获取最近的调用记录
   * @private
   */
  _getRecentInvocations: async function (assistantId, limit = 10) {
    const invocations = await prisma.workspace_agent_invocations.findMany({
      where: { assistant_id: assistantId, closed: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        uuid: true,
        prompt: true,
        success: true,
        createdAt: true,
      },
    });

    // 获取每个调用的步骤数
    const invocationIds = invocations.map((i) => i.id);
    const stepCounts = await prisma.workspace_agent_invocation_steps.groupBy({
      by: ["invocation_id"],
      where: { invocation_id: { in: invocationIds } },
      _count: { id: true },
    });

    const stepCountMap = new Map(
      stepCounts.map((s) => [s.invocation_id, s._count.id])
    );

    return invocations.map((inv) => ({
      uuid: inv.uuid,
      prompt:
        inv.prompt.substring(0, 100) + (inv.prompt.length > 100 ? "..." : ""),
      success: inv.success,
      stepCount: stepCountMap.get(inv.id) || 0,
      createdAt: inv.createdAt.toISOString(),
    }));
  },

  /**
   * 根据周期计算开始时间
   * @private
   */
  _getStartDate: function (period) {
    const now = new Date();
    switch (period) {
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  },
};

module.exports = { PerformanceStatsService };
