const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  ROLES,
  flexUserRoleValid,
} = require("../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { FeedbackCollector, ExperienceMemory } = require("../utils/memory");

/**
 * 用户反馈 API 端点
 */
function feedbackEndpoints(app) {
  if (!app) return;

  /**
   * 提交消息反馈
   * POST /api/v1/workspace/:slug/chat/:chatId/feedback
   */
  app.post(
    "/api/v1/workspace/:slug/chat/:chatId/feedback",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const { chatId } = request.params;
        const { feedback, comment, invocationId, platform, taskType } =
          reqBody(request);

        if (!["positive", "negative"].includes(feedback)) {
          return response.status(400).json({
            success: false,
            error: "Invalid feedback type. Must be 'positive' or 'negative'",
          });
        }

        const result = await FeedbackCollector.recordFeedback({
          chatId: parseInt(chatId),
          invocationId,
          feedback,
          comment,
          userId: user?.id,
          workspaceId: workspace.id,
          platform: platform || "internal",
          taskType: taskType || "qa",
        });

        response.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[Feedback API] Error:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 获取消息反馈状态
   * GET /api/v1/workspace/:slug/chat/:chatId/feedback
   */
  app.get(
    "/api/v1/workspace/:slug/chat/:chatId/feedback",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const { chatId } = request.params;
        const feedback = await FeedbackCollector.getFeedback(parseInt(chatId));

        response.status(200).json({
          success: true,
          data: { feedback },
        });
      } catch (error) {
        console.error("[Feedback API] Error:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 获取平台表现分析（管理员）
   * GET /api/v1/admin/analytics/platform/:platform
   */
  app.get(
    "/api/v1/admin/analytics/platform/:platform",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { platform } = request.params;
        const { timeRange = "30d" } = request.query;

        const analysis = await ExperienceMemory.analyzePlatformPerformance(
          platform,
          timeRange
        );

        response.status(200).json({
          success: true,
          data: analysis,
        });
      } catch (error) {
        console.error("[Analytics API] Error:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  /**
   * 获取所有平台对比分析（管理员）
   * GET /api/v1/admin/analytics/platforms
   */
  app.get(
    "/api/v1/admin/analytics/platforms",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { timeRange = "30d" } = request.query;
        const comparison = await ExperienceMemory.comparePlatforms(timeRange);

        response.status(200).json({
          success: true,
          data: comparison,
        });
      } catch (error) {
        console.error("[Analytics API] Error:", error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { feedbackEndpoints };
