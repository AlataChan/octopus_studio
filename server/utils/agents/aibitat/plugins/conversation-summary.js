/**
 * Conversation Summary Plugin
 *
 * Phase K: 对话摘要 - 增量摘要策略
 *
 * 提供对话历史的智能摘要功能：
 * - 自动检测对话长度，触发摘要生成
 * - 增量式摘要：不是每次重新摘要全部，而是摘要新增部分
 * - 保留关键信息：重要决策、用户偏好、关键结论
 * - 压缩比例可配置
 */

const { v4: uuidv4 } = require("uuid");

// 摘要阈值配置
const SUMMARY_CONFIG = {
  // 触发摘要的消息数量阈值
  messageThreshold: 10,
  // 触发摘要的 token 数量阈值（估算）
  tokenThreshold: 3000,
  // 每条消息的平均 token 估算
  avgTokensPerMessage: 150,
  // 摘要后保留的最近消息数
  recentMessagesToKeep: 3,
  // 摘要压缩比例目标
  compressionRatio: 0.3,
};

/**
 * 估算文本的 token 数量
 * @param {string} text - 文本内容
 * @returns {number} 估算的 token 数
 */
function estimateTokens(text) {
  if (!text) return 0;
  // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 估算消息历史的总 token 数
 * @param {Array} messages - 消息历史
 * @returns {number} 总 token 数
 */
function estimateTotalTokens(messages) {
  return messages.reduce((sum, msg) => {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    return sum + estimateTokens(content);
  }, 0);
}

/**
 * 检测是否需要生成摘要
 * @param {Array} messages - 消息历史
 * @param {Object} existingSummary - 已有的摘要信息
 * @returns {boolean} 是否需要摘要
 */
function needsSummary(messages, existingSummary = null) {
  // 如果已有摘要，检查新增消息数量
  if (existingSummary) {
    const newMessages = messages.length - existingSummary.lastMessageIndex;
    if (newMessages < SUMMARY_CONFIG.messageThreshold / 2) {
      return false;
    }
  }

  // 检查消息数量阈值
  if (messages.length >= SUMMARY_CONFIG.messageThreshold) {
    return true;
  }

  // 检查 token 阈值
  const totalTokens = estimateTotalTokens(messages);
  if (totalTokens >= SUMMARY_CONFIG.tokenThreshold) {
    return true;
  }

  return false;
}

/**
 * 提取关键信息（用于摘要保留）
 * @param {Array} messages - 消息历史
 * @returns {Object} 关键信息对象
 */
function extractKeyInfo(messages) {
  const keyInfo = {
    decisions: [],
    userPreferences: [],
    conclusions: [],
    topics: [],
  };

  for (const msg of messages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);

    // 检测决策性语句
    if (
      content.includes("决定") ||
      content.includes("选择") ||
      content.includes("确认") ||
      content.includes("agree") ||
      content.includes("decide")
    ) {
      keyInfo.decisions.push({
        role: msg.role,
        snippet: content.substring(0, 200),
      });
    }

    // 检测用户偏好
    if (msg.role === "user") {
      if (
        content.includes("我想") ||
        content.includes("我要") ||
        content.includes("我希望") ||
        content.includes("I want") ||
        content.includes("I prefer")
      ) {
        keyInfo.userPreferences.push(content.substring(0, 150));
      }
    }

    // 检测结论性语句
    if (
      content.includes("总结") ||
      content.includes("结论") ||
      content.includes("综上") ||
      content.includes("in conclusion") ||
      content.includes("summary")
    ) {
      keyInfo.conclusions.push(content.substring(0, 200));
    }
  }

  // 提取主题关键词（简单实现）
  const allContent = messages.map((m) => m.content).join(" ");
  const words = allContent.split(/\s+/).filter((w) => w.length > 2);
  const wordCounts = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }
  keyInfo.topics = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return keyInfo;
}

const conversationSummary = {
  name: "conversation-summary",
  startupConfig: {
    params: {
      enabled: {
        required: false,
        default: true,
      },
      autoSummarize: {
        required: false,
        default: true,
      },
    },
  },
  plugin: function ({ enabled = true, autoSummarize = true } = {}) {
    return {
      name: this.name,
      setup(aibitat) {
        if (!enabled) return;

        // 存储摘要状态
        let currentSummary = null;
        let messagesSinceLastSummary = [];

        /**
         * 生成对话摘要
         * @param {Array} messages - 要摘要的消息
         * @param {Object} previousSummary - 之前的摘要（用于增量摘要）
         * @returns {Object} 摘要对象
         */
        async function generateSummary(messages, previousSummary = null) {
          const keyInfo = extractKeyInfo(messages);

          // 构建摘要内容
          let summaryContent = "";

          // 如果有之前的摘要，先包含它
          if (previousSummary?.content) {
            summaryContent += `[历史摘要]\n${previousSummary.content}\n\n`;
          }

          // 添加新对话摘要
          summaryContent += `[新增对话要点]\n`;

          // 提取每轮对话的核心内容
          const summaryPoints = [];
          for (let i = 0; i < messages.length; i += 2) {
            const userMsg = messages[i];
            const assistantMsg = messages[i + 1];

            if (userMsg && assistantMsg) {
              const userContent =
                typeof userMsg.content === "string"
                  ? userMsg.content
                  : JSON.stringify(userMsg.content);
              const assistantContent =
                typeof assistantMsg.content === "string"
                  ? assistantMsg.content
                  : JSON.stringify(assistantMsg.content);

              // 压缩每轮对话
              const userSnippet = userContent.substring(0, 100);
              const assistantSnippet = assistantContent.substring(0, 150);

              summaryPoints.push(
                `- 用户: ${userSnippet}${userContent.length > 100 ? "..." : ""}`
              );
              summaryPoints.push(
                `  助手: ${assistantSnippet}${assistantContent.length > 150 ? "..." : ""}`
              );
            }
          }

          summaryContent += summaryPoints.join("\n");

          // 添加关键信息
          if (keyInfo.decisions.length > 0) {
            summaryContent += `\n\n[重要决策]\n`;
            keyInfo.decisions.slice(0, 3).forEach((d) => {
              summaryContent += `- ${d.snippet}\n`;
            });
          }

          if (keyInfo.userPreferences.length > 0) {
            summaryContent += `\n[用户偏好]\n`;
            keyInfo.userPreferences.slice(0, 3).forEach((p) => {
              summaryContent += `- ${p}\n`;
            });
          }

          const summary = {
            id: uuidv4(),
            content: summaryContent,
            tokenCount: estimateTokens(summaryContent),
            originalTokenCount: estimateTotalTokens(messages),
            messageCount: messages.length,
            lastMessageIndex: messages.length - 1,
            keyInfo,
            createdAt: Date.now(),
            isIncremental: !!previousSummary,
          };

          return summary;
        }

        // 暴露摘要功能给 aibitat
        aibitat.conversationSummary = {
          /**
           * 检查并生成摘要（自动模式）
           * @param {Array} messages - 当前消息历史
           */
          checkAndSummarize: async function (messages) {
            if (!autoSummarize) return null;

            if (needsSummary(messages, currentSummary)) {
              // 确定需要摘要的消息范围
              const startIndex = currentSummary
                ? currentSummary.lastMessageIndex + 1
                : 0;
              const endIndex =
                messages.length - SUMMARY_CONFIG.recentMessagesToKeep;

              if (endIndex <= startIndex) return null;

              const messagesToSummarize = messages.slice(startIndex, endIndex);
              currentSummary = await generateSummary(
                messagesToSummarize,
                currentSummary
              );

              // 发送摘要到前端
              if (aibitat.socket?.send) {
                aibitat.socket.send("conversationSummary", {
                  summary: currentSummary,
                  recentMessages: messages.slice(
                    -SUMMARY_CONFIG.recentMessagesToKeep
                  ),
                  compressionRatio:
                    currentSummary.tokenCount /
                    currentSummary.originalTokenCount,
                });
              }

              return currentSummary;
            }
            return null;
          },

          /**
           * 强制生成摘要
           * @param {Array} messages - 消息历史
           */
          forceSummarize: async function (messages) {
            const endIndex =
              messages.length - SUMMARY_CONFIG.recentMessagesToKeep;
            if (endIndex <= 0) return null;

            const messagesToSummarize = messages.slice(0, endIndex);
            currentSummary = await generateSummary(
              messagesToSummarize,
              currentSummary
            );

            if (aibitat.socket?.send) {
              aibitat.socket.send("conversationSummary", {
                summary: currentSummary,
                recentMessages: messages.slice(
                  -SUMMARY_CONFIG.recentMessagesToKeep
                ),
                compressionRatio:
                  currentSummary.tokenCount / currentSummary.originalTokenCount,
              });
            }

            return currentSummary;
          },

          /**
           * 获取当前摘要
           */
          getCurrentSummary: function () {
            return currentSummary;
          },

          /**
           * 获取用于 LLM 的上下文（摘要 + 最近消息）
           * @param {Array} messages - 完整消息历史
           */
          getContextForLLM: function (messages) {
            if (!currentSummary) {
              return messages;
            }

            // 返回摘要 + 最近消息
            const summaryMessage = {
              role: "system",
              content: `[对话历史摘要]\n${currentSummary.content}`,
            };

            const recentMessages = messages.slice(
              -SUMMARY_CONFIG.recentMessagesToKeep
            );

            return [summaryMessage, ...recentMessages];
          },

          /**
           * 重置摘要状态
           */
          reset: function () {
            currentSummary = null;
            messagesSinceLastSummary = [];
          },
        };

        // 注册为可调用的工具函数
        aibitat.function({
          name: "summarize-conversation",
          description: `总结当前对话历史。当对话变得很长时，可以调用此函数生成摘要。
返回摘要内容和压缩比例。`,
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "生成摘要的原因",
              },
            },
          },
          handler: async function ({ reason }) {
            const messages = aibitat.chats || [];
            if (messages.length < 3) {
              return "对话太短，无需摘要";
            }

            const summary =
              await aibitat.conversationSummary.forceSummarize(messages);
            if (!summary) {
              return "摘要生成失败";
            }

            return `已生成对话摘要。
- 原始消息数: ${summary.messageCount}
- 原始 token 数: ${summary.originalTokenCount}
- 摘要 token 数: ${summary.tokenCount}
- 压缩比例: ${((summary.tokenCount / summary.originalTokenCount) * 100).toFixed(1)}%
- 保留关键决策: ${summary.keyInfo.decisions.length} 项
- 保留用户偏好: ${summary.keyInfo.userPreferences.length} 项`;
          },
        });
      },
    };
  },
};

module.exports = {
  conversationSummary,
  SUMMARY_CONFIG,
  estimateTokens,
  needsSummary,
};
