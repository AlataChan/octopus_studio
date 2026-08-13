const prisma = require("../prisma");
const { safeJsonParse } = require("../http");
const { SCHEMA_VERSION } = require("./workingMemory");

/**
 * 对话摘要生成器
 *
 * Phase 2: 定期总结对话内容，存储到 Thread metadata 中
 * Phase 3: Context Engineering 锚定摘要模板
 *
 * 用于 Platform 模式下为外部平台提供对话背景
 */
class ConversationSummarizer {
  // 触发摘要的阈值（每 N 条消息更新一次）
  static SUMMARY_THRESHOLD = 10;
  // 摘要最大 token 数
  static MAX_SUMMARY_TOKENS = 500;

  /**
   * 锚定摘要模板
   * 使用结构化格式确保关键信息在长对话中不丢失
   */
  static ANCHORED_SUMMARY_TEMPLATE = `你是一个对话摘要助手。请根据对话内容生成结构化摘要。

## 输出格式要求

请严格按照以下 JSON 格式输出，不要有其他内容：

{
  "session_intent": "用户本次会话的核心目标（1句话）",
  "main_topics": ["讨论的主要话题1", "话题2"],
  "key_decisions": ["重要决策1", "决策2"],
  "pending_tasks": ["待完成任务1", "任务2"],
  "artifacts": ["生成的产物1", "产物2"],
  "summary_text": "整体对话摘要（2-3句话）"
}

## 字段说明

- session_intent: 提炼用户最核心的目标，例如"实现用户登录功能"
- main_topics: 对话涉及的主要技术/业务话题
- key_decisions: 对话中明确做出的技术或业务决策
- pending_tasks: 明确提到但尚未完成的任务
- artifacts: 已生成的文件、代码、文档等
- summary_text: 对话整体的简洁摘要`;

  /**
   * 检查并更新对话摘要
   * @param {Object} thread - Thread 对象
   * @param {Object} workspace - Workspace 对象
   * @param {Object} provider - LLM Provider 实例
   * @returns {Promise<string|null>} 新摘要或 null
   */
  static async checkAndUpdateSummary(thread, workspace, provider) {
    if (!thread || !workspace) return null;

    try {
      // 获取当前消息数
      const chatCount = await prisma.workspace_chats.count({
        where: {
          workspaceId: workspace.id,
          thread_id: thread.id,
        },
      });

      // 获取上次摘要时的消息数
      const metadata = safeJsonParse(thread.metadata, {});
      const lastSummaryAt = metadata?.conversation_summary?.messageCount || 0;

      // 检查是否需要更新摘要
      if (chatCount - lastSummaryAt < this.SUMMARY_THRESHOLD) {
        return null;
      }

      console.log(
        `[ConversationSummarizer] Updating summary for thread ${thread.id} (${chatCount} messages)`
      );

      // 获取新消息
      const newMessages = await this.getMessagesSince(
        thread.id,
        workspace.id,
        lastSummaryAt
      );
      if (newMessages.length === 0) return null;

      // 生成增量摘要
      const previousSummary = metadata?.conversation_summary?.content || "";
      const previousAnchored = metadata?.conversation_summary?.anchored || null;
      const newSummary = await this.generateAnchoredSummary(
        previousSummary,
        previousAnchored,
        newMessages,
        provider
      );

      // 更新 Thread 元数据（包含锚定字段）
      await this.updateThreadMetadata(thread.id, {
        ...metadata,
        schema_version: SCHEMA_VERSION,
        conversation_summary: {
          content: newSummary.summary_text || newSummary,
          anchored: newSummary,
          messageCount: chatCount,
          updatedAt: new Date().toISOString(),
        },
        // 同步更新工作记忆的锚定字段
        session_intent: newSummary.session_intent || metadata.session_intent,
        active_topics: this.mergeArrays(
          metadata.active_topics,
          newSummary.main_topics,
          5
        ),
        key_decisions: this.mergeDecisions(
          metadata.key_decisions,
          newSummary.key_decisions,
          10
        ),
        pending_tasks: this.mergeTasks(
          metadata.pending_tasks,
          newSummary.pending_tasks,
          10
        ),
        artifacts_generated: this.mergeArrays(
          metadata.artifacts_generated,
          newSummary.artifacts,
          20
        ),
      });

      console.log(
        `[ConversationSummarizer] Anchored summary updated for thread ${thread.id}`
      );
      return newSummary.summary_text || newSummary;
    } catch (error) {
      console.error("[ConversationSummarizer] Error:", error);
      return null;
    }
  }

  /**
   * 合并数组，保留最新的 N 个元素
   */
  static mergeArrays(existing, newItems, maxLength) {
    if (!newItems || newItems.length === 0) return existing || [];
    const merged = [...(existing || [])];
    for (const item of newItems) {
      if (typeof item === "string" && !merged.includes(item)) {
        merged.push(item);
      }
    }
    return merged.slice(-maxLength);
  }

  /**
   * 合并决策，转换为对象格式
   */
  static mergeDecisions(existing, newDecisions, maxLength) {
    if (!newDecisions || newDecisions.length === 0) return existing || [];
    const merged = [...(existing || [])];
    for (const decision of newDecisions) {
      const decisionObj =
        typeof decision === "string"
          ? {
              id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              decision,
              createdAt: new Date().toISOString(),
            }
          : decision;
      merged.push(decisionObj);
    }
    return merged.slice(-maxLength);
  }

  /**
   * 合并任务，转换为对象格式
   */
  static mergeTasks(existing, newTasks, maxLength) {
    if (!newTasks || newTasks.length === 0) return existing || [];
    const merged = [...(existing || [])];
    for (const task of newTasks) {
      const taskObj =
        typeof task === "string"
          ? {
              id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              task,
              status: "pending",
              createdAt: new Date().toISOString(),
            }
          : task;
      merged.push(taskObj);
    }
    return merged.slice(-maxLength);
  }

  /**
   * 获取指定消息数之后的新消息
   */
  static async getMessagesSince(threadId, workspaceId, sinceCount) {
    const messages = await prisma.workspace_chats.findMany({
      where: {
        thread_id: threadId,
        workspaceId: workspaceId,
      },
      orderBy: { createdAt: "asc" },
      skip: sinceCount,
      take: this.SUMMARY_THRESHOLD * 2, // 最多取两倍阈值的消息
    });

    return messages.map((m) => ({
      role: m.role || "user",
      content: m.prompt || m.response || "",
    }));
  }

  /**
   * 生成锚定格式的对话摘要
   * @param {string} previousSummary - 之前的摘要文本
   * @param {Object} previousAnchored - 之前的锚定摘要对象
   * @param {Array} newMessages - 新消息列表
   * @param {Object} provider - LLM Provider 实例
   * @returns {Object} 锚定摘要对象
   */
  static async generateAnchoredSummary(
    previousSummary,
    previousAnchored,
    newMessages,
    provider
  ) {
    if (!provider) {
      console.warn(
        "[ConversationSummarizer] No provider available, skipping summary generation"
      );
      return (
        previousAnchored || { summary_text: previousSummary || "暂无摘要" }
      );
    }

    const messagesText = newMessages
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n");

    // 构建包含历史上下文的 prompt
    let contextSection = "";
    if (previousAnchored) {
      contextSection = `
## 之前的摘要信息

会话意图: ${previousAnchored.session_intent || "未知"}
主要话题: ${(previousAnchored.main_topics || []).join(", ") || "无"}
关键决策: ${(previousAnchored.key_decisions || []).join(", ") || "无"}
待办任务: ${(previousAnchored.pending_tasks || []).join(", ") || "无"}
已生成产物: ${(previousAnchored.artifacts || []).join(", ") || "无"}
之前摘要: ${previousAnchored.summary_text || previousSummary || "无"}

`;
    } else if (previousSummary) {
      contextSection = `
## 之前的摘要

${previousSummary}

`;
    }

    const prompt = `${this.ANCHORED_SUMMARY_TEMPLATE}

${contextSection}## 新的对话内容

${messagesText}

## 任务

请分析${previousAnchored || previousSummary ? "之前的摘要和" : ""}新的对话内容，生成更新后的结构化摘要。
注意：
1. 如果之前有摘要，请在其基础上更新，保留仍然有效的信息
2. 如果任务已完成，请从 pending_tasks 中移除
3. 总结应简洁，不超过 ${this.MAX_SUMMARY_TOKENS} tokens

请直接输出 JSON：`;

    try {
      const response = (await provider.getChatCompletion)
        ? await provider.getChatCompletion([{ role: "user", content: prompt }])
        : await provider.complete([{ role: "user", content: prompt }]);

      const responseText =
        response?.textResponse || response?.text || response?.result || "";

      // 尝试解析 JSON 响应
      const parsed = this.parseAnchoredResponse(responseText);
      return (
        parsed || {
          summary_text: responseText || previousSummary || "暂无摘要",
        }
      );
    } catch (error) {
      console.error("[ConversationSummarizer] LLM call failed:", error);
      return (
        previousAnchored || { summary_text: previousSummary || "暂无摘要" }
      );
    }
  }

  /**
   * 解析锚定摘要响应
   * @param {string} responseText - LLM 响应文本
   * @returns {Object|null} 解析后的锚定摘要对象
   */
  static parseAnchoredResponse(responseText) {
    if (!responseText) return null;

    try {
      // 尝试直接解析
      const parsed = JSON.parse(responseText);
      return this.validateAnchoredSummary(parsed);
    } catch {
      // 尝试从文本中提取 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.validateAnchoredSummary(parsed);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * 验证并规范化锚定摘要对象
   */
  static validateAnchoredSummary(obj) {
    if (!obj || typeof obj !== "object") return null;

    return {
      session_intent:
        typeof obj.session_intent === "string" ? obj.session_intent : null,
      main_topics: Array.isArray(obj.main_topics)
        ? obj.main_topics.filter((t) => typeof t === "string")
        : [],
      key_decisions: Array.isArray(obj.key_decisions)
        ? obj.key_decisions.filter((d) => typeof d === "string")
        : [],
      pending_tasks: Array.isArray(obj.pending_tasks)
        ? obj.pending_tasks.filter((t) => typeof t === "string")
        : [],
      artifacts: Array.isArray(obj.artifacts)
        ? obj.artifacts.filter((a) => typeof a === "string")
        : [],
      summary_text:
        typeof obj.summary_text === "string" ? obj.summary_text : "",
    };
  }

  /**
   * 更新 Thread 元数据
   */
  static async updateThreadMetadata(threadId, metadata) {
    await prisma.workspace_threads.update({
      where: { id: threadId },
      data: {
        metadata: JSON.stringify(metadata),
        lastUpdatedAt: new Date(),
      },
    });
  }

  /**
   * 获取对话摘要
   * @param {Object} thread - Thread 对象
   * @returns {string|null} 摘要内容
   */
  static getSummary(thread) {
    if (!thread?.metadata) return null;
    const metadata = safeJsonParse(thread.metadata, {});
    return metadata?.conversation_summary?.content || null;
  }

  /**
   * 获取锚定摘要对象
   * @param {Object} thread - Thread 对象
   * @returns {Object|null} 锚定摘要对象
   */
  static getAnchoredSummary(thread) {
    if (!thread?.metadata) return null;
    const metadata = safeJsonParse(thread.metadata, {});
    return metadata?.conversation_summary?.anchored || null;
  }

  /**
   * 格式化摘要为上下文注入格式（锚定版本）
   * @param {Object} thread - Thread 对象
   * @returns {string|null} 格式化的摘要
   */
  static formatSummaryForContext(thread) {
    if (!thread?.metadata) return null;
    const metadata = safeJsonParse(thread.metadata, {});
    const anchored = metadata?.conversation_summary?.anchored;
    const summary = metadata?.conversation_summary?.content;

    if (!anchored && !summary) return null;

    const parts = [];

    // 使用锚定格式
    if (anchored) {
      if (anchored.session_intent) {
        parts.push(`[会话意图]: ${anchored.session_intent}`);
      }
      if (anchored.main_topics?.length > 0) {
        parts.push(`[主要话题]: ${anchored.main_topics.join(", ")}`);
      }
      if (anchored.key_decisions?.length > 0) {
        parts.push(
          `[关键决策]: ${anchored.key_decisions.slice(-3).join("; ")}`
        );
      }
      if (anchored.pending_tasks?.length > 0) {
        parts.push(`[待办任务]: ${anchored.pending_tasks.join("; ")}`);
      }
      if (anchored.artifacts?.length > 0) {
        parts.push(`[已生成]: ${anchored.artifacts.slice(-5).join(", ")}`);
      }
      if (anchored.summary_text) {
        parts.push(`[对话摘要]: ${anchored.summary_text}`);
      }
    } else if (summary) {
      // 回退到旧格式
      parts.push(`[对话背景]\n${summary}`);
    }

    const updatedAt = metadata?.conversation_summary?.updatedAt;
    if (updatedAt) {
      parts.push(`(更新于: ${new Date(updatedAt).toLocaleString("zh-CN")})`);
    }

    return parts.join("\n");
  }

  /**
   * 兼容旧版本的 generateSummary 方法
   * @deprecated 请使用 generateAnchoredSummary
   */
  static async generateSummary(previousSummary, newMessages, provider) {
    const result = await this.generateAnchoredSummary(
      previousSummary,
      null,
      newMessages,
      provider
    );
    return result.summary_text || result;
  }
}

module.exports = { ConversationSummarizer };
