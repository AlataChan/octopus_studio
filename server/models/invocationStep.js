const prisma = require("../utils/prisma");

/**
 * AI员工调用步骤追踪模型
 * 用于记录每次Agent调用中的工具执行步骤
 *
 * @description
 * 该模型是 AI 员工进化系统 MVP Phase 1 的核心数据层
 * 支持记录工具调用的输入/输出、成功状态、耗时等信息
 */
const InvocationStep = {
  /**
   * 步骤类型枚举
   */
  StepTypes: {
    TOOL_CALL: "tool_call",
    FLOW_CALL: "flow_call",
    ERROR: "error",
    USER_INTERRUPT: "user_interrupt",
  },

  /**
   * 创建新的调用步骤记录
   * @param {Object} data - 步骤数据
   * @param {number} data.invocation_id - 关联的 invocation ID
   * @param {number} data.step_index - 步骤序号
   * @param {string} data.step_type - 步骤类型
   * @param {string} [data.tool_name] - 工具名称
   * @param {string} [data.input_summary] - 输入摘要(已脱敏)
   * @param {string} [data.output_summary] - 输出摘要(已脱敏)
   * @param {boolean} [data.success=true] - 是否成功
   * @param {string} [data.error_message] - 错误信息
   * @param {number} [data.duration_ms] - 执行耗时(毫秒)
   * @returns {Promise<Object|null>} 创建的步骤记录
   */
  create: async function (data) {
    try {
      const step = await prisma.workspace_agent_invocation_steps.create({
        data: {
          invocation_id: data.invocation_id,
          step_index: data.step_index,
          step_type: data.step_type,
          tool_name: data.tool_name || null,
          input_summary: data.input_summary || null,
          output_summary: data.output_summary || null,
          success: data.success ?? true,
          error_message: data.error_message || null,
          duration_ms: data.duration_ms || null,
        },
      });
      return step;
    } catch (error) {
      console.error("[InvocationStep] Create failed:", error.message);
      return null;
    }
  },

  /**
   * 批量创建步骤记录
   * @param {Array<Object>} steps - 步骤数据数组
   * @returns {Promise<{count: number}>} 创建的记录数
   */
  createMany: async function (steps) {
    try {
      const result = await prisma.workspace_agent_invocation_steps.createMany({
        data: steps.map((step) => ({
          invocation_id: step.invocation_id,
          step_index: step.step_index,
          step_type: step.step_type,
          tool_name: step.tool_name || null,
          input_summary: step.input_summary || null,
          output_summary: step.output_summary || null,
          success: step.success ?? true,
          error_message: step.error_message || null,
          duration_ms: step.duration_ms || null,
        })),
      });
      return result;
    } catch (error) {
      console.error("[InvocationStep] CreateMany failed:", error.message);
      return { count: 0 };
    }
  },

  /**
   * 根据 invocation ID 获取所有步骤
   * @param {number} invocationId - Invocation ID
   * @returns {Promise<Array>} 步骤列表(按 step_index 排序)
   */
  getByInvocationId: async function (invocationId) {
    try {
      const steps = await prisma.workspace_agent_invocation_steps.findMany({
        where: { invocation_id: parseInt(invocationId) },
        orderBy: { step_index: "asc" },
      });
      return steps;
    } catch (error) {
      console.error(
        "[InvocationStep] GetByInvocationId failed:",
        error.message
      );
      return [];
    }
  },

  /**
   * 获取指定时间范围内的工具统计
   * @param {Object} options - 查询选项
   * @param {Date} options.startDate - 开始时间
   * @param {Date} [options.endDate] - 结束时间(默认当前)
   * @param {number} [options.limit=10] - 返回数量
   * @returns {Promise<Array>} 工具统计列表
   */
  getToolStats: async function ({
    startDate,
    endDate = new Date(),
    limit = 10,
  }) {
    try {
      // 使用 groupBy 聚合，不包含 _sum（布尔字段不支持 sum）
      const stats = await prisma.workspace_agent_invocation_steps.groupBy({
        by: ["tool_name"],
        where: {
          created_at: {
            gte: startDate,
            lte: endDate,
          },
          tool_name: { not: null },
        },
        _count: { id: true },
        _avg: { duration_ms: true },
      });

      // 计算成功率需要额外查询
      const enrichedStats = await Promise.all(
        stats.map(async (stat) => {
          const successCount =
            await prisma.workspace_agent_invocation_steps.count({
              where: {
                tool_name: stat.tool_name,
                success: true,
                created_at: { gte: startDate, lte: endDate },
              },
            });

          return {
            tool_name: stat.tool_name,
            total_calls: stat._count.id,
            success_calls: successCount,
            success_rate:
              stat._count.id > 0
                ? Number((successCount / stat._count.id).toFixed(2))
                : 0,
            avg_duration_ms: Math.round(stat._avg.duration_ms || 0),
          };
        })
      );

      return enrichedStats
        .sort((a, b) => b.total_calls - a.total_calls)
        .slice(0, limit);
    } catch (error) {
      console.error("[InvocationStep] GetToolStats failed:", error.message);
      return [];
    }
  },

  /**
   * 获取 Planning 决策日志
   * @param {Object} options - 查询选项
   * @param {number} options.workspaceId - Workspace ID
   * @param {Date} [options.startDate] - 开始时间
   * @param {Date} [options.endDate] - 结束时间
   * @param {number} [options.limit=50] - 返回数量
   * @param {number} [options.offset=0] - 偏移量
   * @returns {Promise<Object>} Planning 决策列表和总数
   */
  getPlanningDecisions: async function ({
    workspaceId,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  }) {
    try {
      const whereClause = {
        step_type: "planning_decision", // 专门筛选 Planning 决策类型
        invocation: {
          workspace_id: parseInt(workspaceId),
        },
      };

      // 时间范围筛选
      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at.gte = new Date(startDate);
        if (endDate) whereClause.created_at.lte = new Date(endDate);
      }

      const [decisions, total] = await Promise.all([
        prisma.workspace_agent_invocation_steps.findMany({
          where: whereClause,
          orderBy: { created_at: "desc" },
          take: limit,
          skip: offset,
          include: {
            invocation: {
              select: {
                uuid: true,
                prompt: true,
                success: true,
                assistant_id: true,
              },
            },
          },
        }),
        prisma.workspace_agent_invocation_steps.count({ where: whereClause }),
      ]);

      return {
        decisions: decisions.map((d) => ({
          id: d.id,
          invocationUuid: d.invocation?.uuid,
          prompt: d.invocation?.prompt?.substring(0, 100) + "...",
          assistantId: d.invocation?.assistant_id,
          invocationSuccess: d.invocation?.success,
          stepIndex: d.step_index,
          toolName: d.tool_name,
          inputSummary: d.input_summary,
          outputSummary: d.output_summary,
          success: d.success,
          durationMs: d.duration_ms,
          createdAt: d.created_at.toISOString(),
        })),
        total,
        limit,
        offset,
      };
    } catch (error) {
      console.error(
        "[InvocationStep] GetPlanningDecisions failed:",
        error.message
      );
      return { decisions: [], total: 0, limit, offset };
    }
  },

  /**
   * 获取 Planning 决策统计
   * @param {Object} options - 查询选项
   * @param {number} options.workspaceId - Workspace ID
   * @param {Date} [options.startDate] - 开始时间
   * @param {Date} [options.endDate] - 结束时间
   * @returns {Promise<Object>} 统计信息
   */
  getPlanningStats: async function ({ workspaceId, startDate, endDate }) {
    try {
      const whereClause = {
        step_type: "planning_decision",
        invocation: {
          workspace_id: parseInt(workspaceId),
        },
      };

      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at.gte = new Date(startDate);
        if (endDate) whereClause.created_at.lte = new Date(endDate);
      }

      const [totalCount, successCount, avgDuration] = await Promise.all([
        prisma.workspace_agent_invocation_steps.count({ where: whereClause }),
        prisma.workspace_agent_invocation_steps.count({
          where: { ...whereClause, success: true },
        }),
        prisma.workspace_agent_invocation_steps.aggregate({
          where: whereClause,
          _avg: { duration_ms: true },
        }),
      ]);

      // 按覆盖度分组统计（从 output_summary 解析）
      const allDecisions =
        await prisma.workspace_agent_invocation_steps.findMany({
          where: whereClause,
          select: { output_summary: true },
        });

      const coverageStats = { low: 0, medium: 0, high: 0 };
      allDecisions.forEach((d) => {
        const output = d.output_summary || "";
        if (
          output.includes('"coverage":"high"') ||
          output.includes("覆盖度: high")
        ) {
          coverageStats.high++;
        } else if (
          output.includes('"coverage":"medium"') ||
          output.includes("覆盖度: medium")
        ) {
          coverageStats.medium++;
        } else {
          coverageStats.low++;
        }
      });

      return {
        totalDecisions: totalCount,
        successfulDecisions: successCount,
        successRate:
          totalCount > 0 ? Number((successCount / totalCount).toFixed(2)) : 0,
        avgPlanningTimeMs: Math.round(avgDuration._avg?.duration_ms || 0),
        coverageDistribution: coverageStats,
      };
    } catch (error) {
      console.error("[InvocationStep] GetPlanningStats failed:", error.message);
      return {
        totalDecisions: 0,
        successfulDecisions: 0,
        successRate: 0,
        avgPlanningTimeMs: 0,
        coverageDistribution: { low: 0, medium: 0, high: 0 },
      };
    }
  },
};

module.exports = { InvocationStep };
