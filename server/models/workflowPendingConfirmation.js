const prisma = require("../utils/prisma");

/**
 * WorkflowPendingConfirmation 模型
 * 用于管理需要用户确认的工作流执行计划 (HitL - Human-in-the-Loop)
 */
const WorkflowPendingConfirmation = {
  /**
   * 创建待确认的执行计划
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {number|null} params.userId - 用户 ID
   * @param {number|null} params.threadId - Thread ID
   * @param {number|null} params.chatId - Chat ID
   * @param {string} params.planType - 计划类型: tool_call | agent_flow | external_platform | custom
   * @param {string} params.planTitle - 计划标题
   * @param {Object} params.planDetails - 计划详情对象
   * @param {string} params.riskLevel - 风险等级: low | medium | high
   * @param {number} params.timeoutMinutes - 超时时间(分钟,默认 5)
   * @returns {Promise<Object>} 创建的确认记录
   */
  create: async function ({
    workspaceId,
    userId = null,
    threadId = null,
    chatId = null,
    planType,
    planTitle,
    planDetails,
    riskLevel = "medium",
    timeoutMinutes = 5,
    runId = null,
  }) {
    try {
      const planDetailsStr = JSON.stringify(planDetails);
      const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

      const confirmation = await prisma.workflow_pending_confirmations.create({
        data: {
          workspaceId,
          userId,
          threadId,
          chatId,
          planType,
          planTitle,
          planDetails: planDetailsStr,
          riskLevel,
          expiresAt,
          status: "pending",
          runId: runId ? String(runId) : null,
        },
      });

      console.log(
        `[HitL] Created confirmation ${confirmation.id}: ${planTitle} (expires in ${timeoutMinutes}min)`
      );

      return confirmation;
    } catch (error) {
      console.error("[HitL] Error creating confirmation:", error);
      throw error;
    }
  },

  /**
   * 获取待确认的计划
   * @param {number} confirmationId - 确认记录 ID
   * @returns {Promise<Object|null>} 确认记录
   */
  get: async function (confirmationId) {
    try {
      return await prisma.workflow_pending_confirmations.findUnique({
        where: { id: confirmationId },
      });
    } catch (error) {
      console.error("[HitL] Error getting confirmation:", error);
      return null;
    }
  },

  /**
   * 用户批准执行计划
   * @param {number} confirmationId - 确认记录 ID
   * @param {string|null} userResponse - 用户响应信息
   * @returns {Promise<boolean>} 是否成功批准
   */
  approve: async function (confirmationId, userResponse = null) {
    try {
      const confirmation = await this.get(confirmationId);

      if (!confirmation) {
        console.error(`[HitL] Confirmation ${confirmationId} not found`);
        return false;
      }

      if (confirmation.status !== "pending") {
        console.error(
          `[HitL] Confirmation ${confirmationId} is not pending (status: ${confirmation.status})`
        );
        return false;
      }

      // 检查是否已过期
      if (new Date() > new Date(confirmation.expiresAt)) {
        await this.expire(confirmationId);
        return false;
      }

      await prisma.workflow_pending_confirmations.update({
        where: { id: confirmationId },
        data: {
          status: "approved",
          userResponse,
          respondedAt: new Date(),
        },
      });

      console.log(`[HitL] Confirmation ${confirmationId} approved`);
      return true;
    } catch (error) {
      console.error("[HitL] Error approving confirmation:", error);
      return false;
    }
  },

  /**
   * 用户拒绝执行计划
   * @param {number} confirmationId - 确认记录 ID
   * @param {string|null} userResponse - 用户响应信息
   * @returns {Promise<boolean>} 是否成功拒绝
   */
  reject: async function (confirmationId, userResponse = null) {
    try {
      const confirmation = await this.get(confirmationId);

      if (!confirmation || confirmation.status !== "pending") {
        return false;
      }

      await prisma.workflow_pending_confirmations.update({
        where: { id: confirmationId },
        data: {
          status: "rejected",
          userResponse,
          respondedAt: new Date(),
        },
      });

      console.log(`[HitL] Confirmation ${confirmationId} rejected`);
      return true;
    } catch (error) {
      console.error("[HitL] Error rejecting confirmation:", error);
      return false;
    }
  },

  /**
   * 标记确认记录为已过期
   * @param {number} confirmationId - 确认记录 ID
   * @returns {Promise<boolean>} 是否成功标记
   */
  expire: async function (confirmationId) {
    try {
      await prisma.workflow_pending_confirmations.update({
        where: { id: confirmationId },
        data: {
          status: "expired",
          respondedAt: new Date(),
        },
      });

      console.log(`[HitL] Confirmation ${confirmationId} expired`);
      return true;
    } catch (error) {
      console.error("[HitL] Error expiring confirmation:", error);
      return false;
    }
  },

  /**
   * 获取用户的待确认列表
   * @param {Object} params
   * @param {number} params.workspaceId - Workspace ID
   * @param {number|null} params.userId - 用户 ID (可选)
   * @param {string} params.status - 状态过滤 (默认 "pending")
   * @returns {Promise<Array>} 确认记录列表
   */
  listPending: async function ({
    workspaceId,
    userId = null,
    status = "pending",
  }) {
    try {
      const where = {
        workspaceId,
        status,
      };

      if (userId) {
        where.userId = userId;
      }

      const confirmations =
        await prisma.workflow_pending_confirmations.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });

      // 解析 planDetails
      return confirmations.map((c) => ({
        ...c,
        planDetails: JSON.parse(c.planDetails || "{}"),
      }));
    } catch (error) {
      console.error("[HitL] Error listing pending confirmations:", error);
      return [];
    }
  },

  /**
   * 清理过期的待确认记录
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise<number>} 清理的记录数
   */
  cleanupExpired: async function (workspaceId) {
    try {
      const expiredConfirmations =
        await prisma.workflow_pending_confirmations.findMany({
          where: {
            workspaceId,
            status: "pending",
            expiresAt: {
              lt: new Date(),
            },
          },
        });

      for (const confirmation of expiredConfirmations) {
        await this.expire(confirmation.id);
      }

      console.log(
        `[HitL] Cleaned up ${expiredConfirmations.length} expired confirmations`
      );
      return expiredConfirmations.length;
    } catch (error) {
      console.error("[HitL] Error cleaning up expired confirmations:", error);
      return 0;
    }
  },
};

module.exports = { WorkflowPendingConfirmation };
