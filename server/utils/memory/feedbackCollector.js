const prisma = require("../prisma");
const { safeJsonParse } = require("../http");
const { v4: uuidv4 } = require("uuid");

/**
 * 用户反馈收集器
 *
 * 收集用户对 AI 回复的反馈（点赞/踩）
 * 用于质量改进和经验记忆积累
 */
class FeedbackCollector {
  /**
   * 记录用户反馈
   * @param {Object} params
   * @param {number} params.chatId - 消息 ID
   * @param {string} params.invocationId - Agent 调用 ID（可选）
   * @param {string} params.feedback - 反馈类型 (positive|negative)
   * @param {string} params.comment - 反馈评论（可选）
   * @param {number} params.userId - 用户 ID
   * @param {number} params.workspaceId - Workspace ID
   * @param {string} params.platform - 平台类型（用于经验记忆）
   * @param {string} params.taskType - 任务类型（用于经验记忆）
   * @returns {Promise<Object>} 反馈记录
   */
  static async recordFeedback({
    chatId,
    invocationId,
    feedback,
    comment,
    userId,
    workspaceId,
    platform = "internal",
    taskType = "qa",
  }) {
    const validFeedback = ["positive", "negative"].includes(feedback)
      ? feedback
      : null;
    if (!validFeedback) {
      throw new Error(
        "Invalid feedback type. Must be 'positive' or 'negative'"
      );
    }

    try {
      // 1. 更新消息元数据
      if (chatId) {
        await this.updateChatFeedback(chatId, feedback, comment, userId);
      }

      // 2. 更新 Invocation 记录
      if (invocationId) {
        await this.updateInvocationFeedback(invocationId, feedback);
      }

      // 3. 记录到经验记忆
      await this.recordExperience({
        platform,
        taskType,
        feedback,
        invocationId,
        workspaceId,
        userId,
        context: { chatId, comment },
      });

      console.log(
        `[FeedbackCollector] Recorded ${feedback} feedback for chat ${chatId}`
      );
      return { success: true, feedback, chatId };
    } catch (error) {
      console.error("[FeedbackCollector] Error recording feedback:", error);
      throw error;
    }
  }

  /**
   * 更新聊天消息的反馈元数据
   */
  static async updateChatFeedback(chatId, feedback, comment, userId) {
    const chat = await prisma.workspace_chats.findUnique({
      where: { id: chatId },
    });
    if (!chat) return;

    const metadata = safeJsonParse(chat.metadata, {});
    metadata.user_feedback = {
      type: feedback,
      comment: comment || null,
      userId,
      timestamp: new Date().toISOString(),
    };

    await prisma.workspace_chats.update({
      where: { id: chatId },
      data: { metadata: JSON.stringify(metadata) },
    });
  }

  /**
   * 更新 Invocation 的反馈字段
   */
  static async updateInvocationFeedback(invocationId, feedback) {
    try {
      await prisma.workspace_agent_invocations.update({
        where: { id: invocationId },
        data: { user_feedback: feedback },
      });
    } catch (error) {
      // 如果字段不存在，忽略错误
      console.warn(
        "[FeedbackCollector] Could not update invocation feedback:",
        error.message
      );
    }
  }

  /**
   * 记录经验到经验记忆表
   */
  static async recordExperience({
    platform,
    taskType,
    feedback,
    invocationId,
    workspaceId,
    userId,
    context,
  }) {
    await prisma.agent_experience_memory.create({
      data: {
        id: uuidv4(),
        platform,
        taskType,
        feedback,
        invocationId,
        workspaceId,
        userId,
        context: JSON.stringify(context),
      },
    });
  }

  /**
   * 获取消息的反馈信息
   * @param {number} chatId - 消息 ID
   * @returns {Object|null} 反馈信息
   */
  static async getFeedback(chatId) {
    const chat = await prisma.workspace_chats.findUnique({
      where: { id: chatId },
    });
    if (!chat) return null;

    const metadata = safeJsonParse(chat.metadata, {});
    return metadata?.user_feedback || null;
  }
}

module.exports = { FeedbackCollector };
