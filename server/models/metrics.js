/**
 * 观测性指标收集模块
 *
 * 收集系统运行指标,包括:
 * - Chat 量统计
 * - 知识模式分布
 * - 性能指标
 * - 错误率统计
 */

const prisma = require("../utils/prisma");

const Metrics = {
  /**
   * 记录一次 Chat 请求
   * @param {Object} data - Chat 请求数据
   * @param {number} data.workspaceId - Workspace ID
   * @param {number} data.userId - 用户 ID
   * @param {string} data.assistantId - 助手 ID (可选)
   * @param {string} data.knowledgeMode - 知识模式 (workspace/platform/none)
   * @param {number} data.responseTime - 响应时间 (ms)
   * @param {number} data.tokensUsed - Token 消耗
   * @param {boolean} data.hasError - 是否有错误
   * @param {Object} data.metadata - 其他元数据
   */
  recordChat: async function ({
    workspaceId,
    userId,
    assistantId = null,
    knowledgeMode = "none",
    responseTime = 0,
    tokensUsed = 0,
    hasError = false,
    metadata = {},
  }) {
    try {
      await prisma.chat_metrics.create({
        data: {
          workspaceId,
          userId,
          assistantId,
          knowledgeMode,
          responseTime,
          tokensUsed,
          hasError,
          metadata: JSON.stringify(metadata),
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error("[Metrics] Failed to record chat:", error.message);
    }
  },

  /**
   * 获取 Chat 统计数据
   * @param {Object} options - 查询选项
   * @param {Date} options.startDate - 开始日期
   * @param {Date} options.endDate - 结束日期
   * @param {number} options.workspaceId - Workspace ID (可选)
   * @param {string} options.assistantId - 助手 ID (可选)
   * @returns {Object} 统计数据
   */
  getChatStats: async function ({
    startDate,
    endDate,
    workspaceId = null,
    assistantId = null,
  }) {
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (workspaceId) where.workspaceId = workspaceId;
    if (assistantId) where.assistantId = assistantId;

    try {
      const [totalChats, errorChats, avgResponseTime, totalTokens] =
        await Promise.all([
          // 总 Chat 数
          prisma.chat_metrics.count({ where }),

          // 错误 Chat 数
          prisma.chat_metrics.count({
            where: { ...where, hasError: true },
          }),

          // 平均响应时间
          prisma.chat_metrics.aggregate({
            where,
            _avg: { responseTime: true },
          }),

          // 总 Token 消耗
          prisma.chat_metrics.aggregate({
            where,
            _sum: { tokensUsed: true },
          }),
        ]);

      return {
        totalChats,
        errorChats,
        errorRate: totalChats > 0 ? errorChats / totalChats : 0,
        avgResponseTime: avgResponseTime._avg.responseTime || 0,
        totalTokens: totalTokens._sum.tokensUsed || 0,
        avgTokensPerChat:
          totalChats > 0 ? (totalTokens._sum.tokensUsed || 0) / totalChats : 0,
      };
    } catch (error) {
      console.error("[Metrics] Failed to get chat stats:", error.message);
      return {
        totalChats: 0,
        errorChats: 0,
        errorRate: 0,
        avgResponseTime: 0,
        totalTokens: 0,
        avgTokensPerChat: 0,
      };
    }
  },

  /**
   * 获取知识模式分布
   * @param {Object} options - 查询选项
   * @param {Date} options.startDate - 开始日期
   * @param {Date} options.endDate - 结束日期
   * @param {number} options.workspaceId - Workspace ID (可选)
   * @returns {Array} 知识模式分布
   */
  getKnowledgeModeDistribution: async function ({
    startDate,
    endDate,
    workspaceId = null,
  }) {
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (workspaceId) where.workspaceId = workspaceId;

    try {
      const distribution = await prisma.chat_metrics.groupBy({
        by: ["knowledgeMode"],
        where,
        _count: true,
      });

      return distribution.map((item) => ({
        mode: item.knowledgeMode,
        count: item._count,
      }));
    } catch (error) {
      console.error(
        "[Metrics] Failed to get knowledge mode distribution:",
        error.message
      );
      return [];
    }
  },
};

module.exports = { Metrics };
