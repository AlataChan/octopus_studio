/**
 * A/B 测试实验分组模型
 *
 * @description
 * 用于内部实验阶段的 A/B 测试，记录用户分组和实验结果
 */

const prisma = require("../utils/prisma");

function defaultExperimentLabel() {
  return process.env.EXPERIMENT_LABEL || "default_experiment";
}

const ExperimentAssignment = {
  /**
   * 实验名称常量
   */
  Experiments: {
    get DEFAULT() {
      return defaultExperimentLabel();
    },
  },

  /**
   * 分组变体常量
   */
  Variants: {
    WITH_KNOWLEDGE: "with_knowledge",
    WITHOUT_KNOWLEDGE: "without_knowledge",
  },

  /**
   * 基于 userId 的稳定分流
   * @param {number} userId - 用户 ID
   * @returns {string} 分组变体
   */
  assignVariant: function (userId) {
    if (!userId) return this.Variants.WITHOUT_KNOWLEDGE;
    return userId % 2 === 0
      ? this.Variants.WITH_KNOWLEDGE
      : this.Variants.WITHOUT_KNOWLEDGE;
  },

  /**
   * 获取或创建用户的实验分组
   * @param {Object} options - 选项
   * @param {number} [options.userId] - 用户 ID
   * @param {string} [options.sessionId] - 会话 ID（匿名用户）
   * @param {string} options.experiment - 实验名称
   * @returns {Promise<Object>} 分组记录
   */
  getOrCreate: async function ({
    userId,
    sessionId,
    experiment = this.Experiments.DEFAULT,
  }) {
    try {
      // 先查找现有分组
      const existing = await prisma.experiment_assignments.findFirst({
        where: userId ? { userId, experiment } : { sessionId, experiment },
      });

      if (existing) {
        return existing;
      }

      // 创建新分组
      const variant = this.assignVariant(userId);
      const assignment = await prisma.experiment_assignments.create({
        data: {
          userId: userId || null,
          sessionId: sessionId || null,
          experiment,
          variant,
        },
      });

      console.log(
        `[ExperimentAssignment] Created: user=${userId}, experiment=${experiment}, variant=${variant}`
      );
      return assignment;
    } catch (error) {
      console.error(
        "[ExperimentAssignment] GetOrCreate failed:",
        error.message
      );
      // 返回默认分组（对照组）
      return {
        userId,
        sessionId,
        experiment,
        variant: this.Variants.WITHOUT_KNOWLEDGE,
      };
    }
  },

  /**
   * 获取用户的实验分组
   * @param {number} userId - 用户 ID
   * @param {string} experiment - 实验名称
   * @returns {Promise<string|null>} 分组变体
   */
  getVariant: async function (userId, experiment = this.Experiments.DEFAULT) {
    try {
      const assignment = await prisma.experiment_assignments.findFirst({
        where: { userId, experiment },
      });
      return assignment?.variant || null;
    } catch (error) {
      console.error("[ExperimentAssignment] GetVariant failed:", error.message);
      return null;
    }
  },

  /**
   * 获取实验统计
   * @param {string} experiment - 实验名称
   * @returns {Promise<Object>} 统计数据
   */
  getStats: async function (experiment = this.Experiments.DEFAULT) {
    try {
      const [withKnowledge, withoutKnowledge] = await Promise.all([
        prisma.experiment_assignments.count({
          where: { experiment, variant: this.Variants.WITH_KNOWLEDGE },
        }),
        prisma.experiment_assignments.count({
          where: { experiment, variant: this.Variants.WITHOUT_KNOWLEDGE },
        }),
      ]);

      const total = withKnowledge + withoutKnowledge;

      return {
        experiment,
        total,
        variants: {
          [this.Variants.WITH_KNOWLEDGE]: withKnowledge,
          [this.Variants.WITHOUT_KNOWLEDGE]: withoutKnowledge,
        },
        percentages: {
          [this.Variants.WITH_KNOWLEDGE]:
            total > 0 ? Number(((withKnowledge / total) * 100).toFixed(1)) : 0,
          [this.Variants.WITHOUT_KNOWLEDGE]:
            total > 0
              ? Number(((withoutKnowledge / total) * 100).toFixed(1))
              : 0,
        },
      };
    } catch (error) {
      console.error("[ExperimentAssignment] GetStats failed:", error.message);
      return {
        experiment,
        total: 0,
        variants: {
          [this.Variants.WITH_KNOWLEDGE]: 0,
          [this.Variants.WITHOUT_KNOWLEDGE]: 0,
        },
        percentages: {
          [this.Variants.WITH_KNOWLEDGE]: 0,
          [this.Variants.WITHOUT_KNOWLEDGE]: 0,
        },
      };
    }
  },
};

module.exports = { ExperimentAssignment };
