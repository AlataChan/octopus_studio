/**
 * 观测性指标 API 端点
 */

const { Metrics } = require("../models/metrics");
const { WorkspaceGraph } = require("../models/workspaceGraph");
const { InvocationStep } = require("../models/invocationStep");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const { ExperimentAssignment } = require("../models/experimentAssignment");
const { ABTesting } = require("../utils/abTesting");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

const EXPERIMENTS_ADMIN_ENABLED =
  process.env.EXPERIMENTS_ADMIN_ENABLED === "true";

function experimentsAdminDisabledResponse(_request, response) {
  return response.status(404).json({
    success: false,
    error: "Experiments admin not enabled",
    code: "EXPERIMENTS_ADMIN_DISABLED",
  });
}

function metricsEndpoints(app) {
  if (!app) return;

  if (!EXPERIMENTS_ADMIN_ENABLED) {
    app.all(/^\/metrics(?:\/.*)?$/, (request, response) => {
      if (request.method === "OPTIONS") return response.sendStatus(204);
      return experimentsAdminDisabledResponse(request, response);
    });
    return;
  }

  /**
   * GET /api/metrics/chat-stats
   * 获取 Chat 统计数据
   *
   * Query params:
   * - startDate: 开始日期 (ISO string)
   * - endDate: 结束日期 (ISO string)
   * - workspaceId: Workspace ID (可选)
   * - assistantId: 助手 ID (可选)
   */
  app.get(
    "/metrics/chat-stats",
    [validatedRequest],
    async (request, response) => {
      try {
        const { startDate, endDate, workspaceId, assistantId } = request.query;

        if (!startDate || !endDate) {
          response.status(400).json({
            success: false,
            error: "startDate and endDate are required",
          });
          return;
        }

        const stats = await Metrics.getChatStats({
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          workspaceId: workspaceId ? parseInt(workspaceId) : null,
          assistantId: assistantId || null,
        });

        response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[Metrics API] Error getting chat stats:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/knowledge-mode-distribution
   * 获取知识模式分布
   *
   * Query params:
   * - startDate: 开始日期 (ISO string)
   * - endDate: 结束日期 (ISO string)
   * - workspaceId: Workspace ID (可选)
   */
  app.get(
    "/metrics/knowledge-mode-distribution",
    [validatedRequest],
    async (request, response) => {
      try {
        const { startDate, endDate, workspaceId } = request.query;

        if (!startDate || !endDate) {
          response.status(400).json({
            success: false,
            error: "startDate and endDate are required",
          });
          return;
        }

        const distribution = await Metrics.getKnowledgeModeDistribution({
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          workspaceId: workspaceId ? parseInt(workspaceId) : null,
        });

        response.status(200).json({
          success: true,
          data: distribution,
        });
      } catch (error) {
        console.error(
          "[Metrics API] Error getting knowledge mode distribution:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/graph-stats
   * 获取图谱统计数据
   *
   * Query params:
   * - workspaceId: Workspace ID
   */
  app.get(
    "/metrics/graph-stats",
    [validatedRequest],
    async (request, response) => {
      try {
        const { workspaceId } = request.query;

        if (!workspaceId) {
          response.status(400).json({
            success: false,
            error: "workspaceId is required",
          });
          return;
        }

        const stats = await WorkspaceGraph.getStats(parseInt(workspaceId));

        response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[Metrics API] Error getting graph stats:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/planning-decisions
   * 获取 Planning 决策日志
   *
   * Query params:
   * - workspaceId: Workspace ID (必需)
   * - startDate: 开始日期 (ISO string, 可选)
   * - endDate: 结束日期 (ISO string, 可选)
   * - limit: 返回数量 (默认 50)
   * - offset: 偏移量 (默认 0)
   */
  app.get(
    "/metrics/planning-decisions",
    [validatedRequest],
    async (request, response) => {
      try {
        const { workspaceId, startDate, endDate, limit, offset } =
          request.query;

        if (!workspaceId) {
          response.status(400).json({
            success: false,
            error: "workspaceId is required",
          });
          return;
        }

        const result = await InvocationStep.getPlanningDecisions({
          workspaceId: parseInt(workspaceId),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          limit: limit ? parseInt(limit) : 50,
          offset: offset ? parseInt(offset) : 0,
        });

        response.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[Metrics API] Error getting planning decisions:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/planning-stats
   * 获取 Planning 决策统计
   *
   * Query params:
   * - workspaceId: Workspace ID (必需)
   * - startDate: 开始日期 (ISO string, 可选)
   * - endDate: 结束日期 (ISO string, 可选)
   */
  app.get(
    "/metrics/planning-stats",
    [validatedRequest],
    async (request, response) => {
      try {
        const { workspaceId, startDate, endDate } = request.query;

        if (!workspaceId) {
          response.status(400).json({
            success: false,
            error: "workspaceId is required",
          });
          return;
        }

        const stats = await InvocationStep.getPlanningStats({
          workspaceId: parseInt(workspaceId),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        });

        response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error("[Metrics API] Error getting planning stats:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/knowledge-coverage-stats
   * 获取知识覆盖度统计
   *
   * Query params:
   * - workspaceId: Workspace ID (可选)
   * - startDate: 开始日期 (ISO string, 必需)
   * - endDate: 结束日期 (ISO string, 必需)
   */
  app.get(
    "/metrics/knowledge-coverage-stats",
    [validatedRequest],
    async (request, response) => {
      try {
        const { workspaceId, startDate, endDate } = request.query;

        if (!startDate || !endDate) {
          response.status(400).json({
            success: false,
            error: "startDate and endDate are required",
          });
          return;
        }

        const stats = await WorkspaceAgentInvocation.getKnowledgeCoverageStats({
          workspaceId: workspaceId ? parseInt(workspaceId) : null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        });

        response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error(
          "[Metrics API] Error getting knowledge coverage stats:",
          error
        );
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/ab-test/results
   * 获取 A/B 测试结果分析
   *
   * Query params:
   * - startDate: 开始日期 (ISO string, 可选)
   * - endDate: 结束日期 (ISO string, 可选)
   */
  app.get(
    "/metrics/ab-test/results",
    [validatedRequest],
    async (request, response) => {
      try {
        const { startDate, endDate } = request.query;

        const results = await ABTesting.analyzeDefaultExperimentResults({
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        });

        response.status(200).json({
          success: true,
          data: results,
        });
      } catch (error) {
        console.error("[Metrics API] Error getting A/B test results:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/metrics/ab-test/assignments
   * 获取实验分组统计
   *
   * Query params:
   * - experiment: 实验名称 (默认 EXPERIMENT_LABEL 或 default_experiment)
   */
  app.get(
    "/metrics/ab-test/assignments",
    [validatedRequest],
    async (request, response) => {
      try {
        const { experiment = ExperimentAssignment.Experiments.DEFAULT } =
          request.query;

        const stats = await ExperimentAssignment.getStats(experiment);

        response.status(200).json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error(
          "[Metrics API] Error getting experiment assignments:",
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

module.exports = { metricsEndpoints };
