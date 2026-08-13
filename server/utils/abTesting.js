/**
 * A/B 测试分析服务
 *
 * @description
 * 用于内部实验阶段的 A/B 测试结果分析
 */

const prisma = require("./prisma");
const { ExperimentAssignment } = require("../models/experimentAssignment");

const ABTesting = {
  /**
   * 分析默认实验结果
   * @param {Object} options - 选项
   * @param {Date} [options.startDate] - 开始时间
   * @param {Date} [options.endDate] - 结束时间
   * @returns {Promise<Object>} 分析结果
   */
  analyzeDefaultExperimentResults: async function ({
    startDate,
    endDate,
  } = {}) {
    try {
      const whereClause = {
        closed: true,
        knowledge_coverage: { not: null }, // 只分析有知识指标的记录
      };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      // 获取实验组数据（有知识感知）
      const withKnowledge = await prisma.workspace_agent_invocations.findMany({
        where: whereClause,
        select: {
          success: true,
          knowledge_coverage: true,
          planning_duration_ms: true,
          createdAt: true,
          lastUpdatedAt: true,
        },
      });

      // 获取对照组数据（无知识感知）
      const withoutKnowledge =
        await prisma.workspace_agent_invocations.findMany({
          where: {
            closed: true,
            knowledge_coverage: null,
            ...(startDate || endDate
              ? { createdAt: whereClause.createdAt }
              : {}),
          },
          select: {
            success: true,
            createdAt: true,
            lastUpdatedAt: true,
          },
        });

      // 计算统计指标
      const calcStats = (data) => {
        if (data.length === 0) {
          return { count: 0, successRate: 0, avgDuration: 0 };
        }

        const successCount = data.filter((d) => d.success === true).length;
        const durations = data
          .filter((d) => d.lastUpdatedAt && d.createdAt)
          .map((d) => new Date(d.lastUpdatedAt) - new Date(d.createdAt));

        return {
          count: data.length,
          successCount,
          successRate: Number(((successCount / data.length) * 100).toFixed(2)),
          avgDuration:
            durations.length > 0
              ? Math.round(
                  durations.reduce((a, b) => a + b, 0) / durations.length
                )
              : 0,
        };
      };

      const withKnowledgeStats = calcStats(withKnowledge);
      const withoutKnowledgeStats = calcStats(withoutKnowledge);

      // 计算知识覆盖度分布（仅实验组）
      const coverageDistribution = { low: 0, medium: 0, high: 0 };
      withKnowledge.forEach((d) => {
        if (d.knowledge_coverage === "high") coverageDistribution.high++;
        else if (d.knowledge_coverage === "medium")
          coverageDistribution.medium++;
        else coverageDistribution.low++;
      });

      // 计算提升幅度
      const improvement = {
        successRate:
          withKnowledgeStats.successRate - withoutKnowledgeStats.successRate,
        duration:
          withoutKnowledgeStats.avgDuration - withKnowledgeStats.avgDuration,
      };

      return {
        experiment: ExperimentAssignment.Experiments.DEFAULT,
        period: {
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
        },
        withKnowledge: {
          ...withKnowledgeStats,
          coverageDistribution,
        },
        withoutKnowledge: withoutKnowledgeStats,
        improvement: {
          successRate: Number(improvement.successRate.toFixed(2)),
          successRatePercent:
            withoutKnowledgeStats.successRate > 0
              ? Number(
                  (
                    (improvement.successRate /
                      withoutKnowledgeStats.successRate) *
                    100
                  ).toFixed(2)
                )
              : 0,
          durationMs: improvement.duration,
        },
        isSignificant: this._checkSignificance(
          withKnowledgeStats,
          withoutKnowledgeStats
        ),
      };
    } catch (error) {
      console.error(
        "[ABTesting] AnalyzeDefaultExperimentResults failed:",
        error.message
      );
      return {
        experiment: ExperimentAssignment.Experiments.DEFAULT,
        error: error.message,
      };
    }
  },

  /**
   * 简化的统计显著性检验
   * @private
   */
  _checkSignificance: function (groupA, groupB) {
    // 样本量检查
    if (groupA.count < 30 || groupB.count < 30) {
      return {
        significant: false,
        reason: "样本量不足（需要每组至少 30 个样本）",
      };
    }

    // 简化的 Z 检验（用于比例差异）
    const p1 = groupA.successRate / 100;
    const p2 = groupB.successRate / 100;
    const n1 = groupA.count;
    const n2 = groupB.count;

    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

    if (se === 0) {
      return { significant: false, reason: "标准误为零" };
    }

    const z = Math.abs(p1 - p2) / se;
    const pValue = 2 * (1 - this._normalCDF(z)); // 双尾检验

    return {
      significant: pValue < 0.05,
      pValue: Number(pValue.toFixed(4)),
      zScore: Number(z.toFixed(4)),
      reason:
        pValue < 0.05
          ? "结果具有统计显著性 (p < 0.05)"
          : "结果不显著，需要更多样本",
    };
  },

  /**
   * 标准正态分布累积分布函数（近似）
   * @private
   */
  _normalCDF: function (x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  },
};

module.exports = { ABTesting };
