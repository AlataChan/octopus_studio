const prisma = require("../prisma");
const { v4: uuidv4 } = require("uuid");

/**
 * 经验记忆管理器
 *
 * 记录和分析平台表现，用于长期优化决策
 */
class ExperienceMemory {
  /**
   * 记录平台表现经验
   * @param {Object} params
   * @param {string} params.platform - 平台类型 (dify|ragflow|n8n|internal)
   * @param {string} params.taskType - 任务类型 (qa|writing|analysis|coding|etc.)
   * @param {string} params.feedback - 用户反馈 (positive|negative)
   * @param {Object} params.context - 上下文信息
   * @param {string} params.invocationId - 关联的调用 ID
   * @param {number} params.workspaceId - Workspace ID
   * @param {number} params.userId - 用户 ID
   */
  static async recordExperience({
    platform,
    taskType,
    feedback,
    context = {},
    invocationId,
    workspaceId,
    userId,
  }) {
    try {
      await prisma.agent_experience_memory.create({
        data: {
          id: uuidv4(),
          platform,
          taskType,
          feedback,
          context: JSON.stringify(context),
          invocationId,
          workspaceId,
          userId,
        },
      });
      console.log(
        `[ExperienceMemory] Recorded ${feedback} experience for ${platform}/${taskType}`
      );
    } catch (error) {
      console.error("[ExperienceMemory] Error recording experience:", error);
    }
  }

  /**
   * 分析平台表现
   * @param {string} platform - 平台类型
   * @param {string} timeRange - 时间范围 (7d|30d|90d)
   * @returns {Promise<Object>} 平台表现分析
   */
  static async analyzePlatformPerformance(platform, timeRange = "30d") {
    const startDate = this.getStartDate(timeRange);

    const stats = await prisma.agent_experience_memory.groupBy({
      by: ["taskType", "feedback"],
      where: {
        platform,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // 计算各任务类型的满意率
    const performance = {};
    for (const stat of stats) {
      if (!performance[stat.taskType]) {
        performance[stat.taskType] = { positive: 0, negative: 0 };
      }
      performance[stat.taskType][stat.feedback] = stat._count;
    }

    // 转换为满意率
    const result = {};
    for (const [taskType, counts] of Object.entries(performance)) {
      const total = counts.positive + counts.negative;
      result[taskType] = {
        satisfactionRate:
          total > 0 ? Math.round((counts.positive / total) * 100) : null,
        totalFeedbacks: total,
        positive: counts.positive,
        negative: counts.negative,
      };
    }

    return {
      platform,
      timeRange,
      startDate: startDate.toISOString(),
      taskPerformance: result,
      summary: this.generateSummary(result),
    };
  }

  /**
   * 获取所有平台的整体表现对比
   * @param {string} timeRange - 时间范围
   * @returns {Promise<Object>} 平台对比分析
   */
  static async comparePlatforms(timeRange = "30d") {
    const startDate = this.getStartDate(timeRange);

    const stats = await prisma.agent_experience_memory.groupBy({
      by: ["platform", "feedback"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const platforms = {};
    for (const stat of stats) {
      if (!platforms[stat.platform]) {
        platforms[stat.platform] = { positive: 0, negative: 0 };
      }
      platforms[stat.platform][stat.feedback] = stat._count;
    }

    const result = {};
    for (const [platform, counts] of Object.entries(platforms)) {
      const total = counts.positive + counts.negative;
      result[platform] = {
        satisfactionRate:
          total > 0 ? Math.round((counts.positive / total) * 100) : null,
        totalFeedbacks: total,
      };
    }

    return { timeRange, platforms: result };
  }

  /**
   * 根据时间范围字符串获取起始日期
   */
  static getStartDate(timeRange) {
    const now = new Date();
    const days = parseInt(timeRange) || 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  /**
   * 生成表现摘要
   */
  static generateSummary(taskPerformance) {
    const tasks = Object.entries(taskPerformance);
    if (tasks.length === 0) return "暂无足够数据进行分析";

    const bestTask = tasks.reduce((a, b) =>
      (a[1].satisfactionRate || 0) > (b[1].satisfactionRate || 0) ? a : b
    );
    const worstTask = tasks.reduce((a, b) =>
      (a[1].satisfactionRate || 100) < (b[1].satisfactionRate || 100) ? a : b
    );

    return {
      bestPerforming: { taskType: bestTask[0], ...bestTask[1] },
      worstPerforming: { taskType: worstTask[0], ...worstTask[1] },
    };
  }
}

module.exports = { ExperienceMemory };
