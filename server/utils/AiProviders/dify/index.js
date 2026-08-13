/**
 * Dify Provider
 * 用于集成 Dify 智能体编排平台
 */

const DifyClient = require("./DifyClient");

class DifyProvider {
  /**
   * 执行 Dify 助手对话
   * @param {Object} config - Dify 配置
   * @param {string} config.baseUrl - Dify API Base URL
   * @param {string} config.apiKey - Dify API Key
   * @param {string} config.appId - 应用 ID (可选)
   * @param {string} message - 用户消息
   * @param {Object} options - 额外选项
   * @param {string} [options.conversationId] - 会话 ID
   * @param {string} [options.userId] - 用户 ID
   * @param {Object} [options.inputs] - 额外输入变量
   * @returns {Promise<Object>} 对话结果
   */
  static async chat(config, message, options = {}) {
    try {
      const client = new DifyClient(config);

      const response = await client.chat({
        query: message,
        user: options.userId || "default-user",
        conversationId: options.conversationId || null,
        inputs: options.inputs || {},
        responseMode: "blocking",
      });

      // 格式化响应，统一返回格式
      return {
        success: true,
        content: response.answer || response.text || "",
        conversationId: response.conversation_id,
        messageId: response.message_id,
        metadata: {
          platform: "dify",
          model: response.metadata?.model || null,
          usage: response.metadata?.usage || null,
        },
        raw: response,
      };
    } catch (error) {
      console.error("[DifyProvider] Chat error:", error);
      return {
        success: false,
        error: error.message,
        content: "",
      };
    }
  }

  /**
   * 执行流式对话
   * @param {Object} config - Dify 配置
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 接收数据块的回调
   * @param {Object} options - 额外选项
   * @returns {Promise<void>}
   */
  static async chatStream(config, message, onChunk, options = {}) {
    try {
      const client = new DifyClient(config);

      let fullContent = "";
      let conversationId = null;
      let messageId = null;
      let hasReceivedContent = false;

      await client.chatStream(
        {
          query: message,
          user: options.userId || "default-user",
          conversationId: options.conversationId || null,
          inputs: options.inputs || {},
        },
        (chunk) => {
          if (chunk.done) {
            // 流结束
            onChunk({
              type: "done",
              content: fullContent,
              conversationId,
              messageId,
            });
            return;
          }

          // 处理不同类型的事件
          if (chunk.event === "message" || chunk.event === "agent_message") {
            // 对话应用：消息内容
            const delta = chunk.answer || "";
            fullContent += delta;
            hasReceivedContent = true;

            onChunk({
              type: "content",
              delta,
              content: fullContent,
            });
          } else if (chunk.event === "text_chunk") {
            // 工作流应用：文本块
            const delta = chunk.data?.text || "";
            fullContent += delta;
            hasReceivedContent = true;

            onChunk({
              type: "content",
              delta,
              content: fullContent,
            });
          } else if (chunk.event === "message_end") {
            // 对话应用：消息结束
            conversationId = chunk.conversation_id;
            messageId = chunk.message_id;
          } else if (chunk.event === "workflow_finished") {
            // 工作流应用：工作流结束
            conversationId = chunk.conversation_id;
            messageId = chunk.task_id;
          } else if (chunk.event === "error") {
            // 错误
            console.error("[DifyProvider] Error event:", chunk.message);
            onChunk({
              type: "error",
              error: chunk.message || "Unknown error",
            });
          } else if (
            chunk.event === "workflow_started" ||
            chunk.event === "node_started" ||
            chunk.event === "node_finished" ||
            chunk.event === "agent_log" ||
            chunk.event === "agent_thought"
          ) {
            // 工作流/Agent 进度事件，静默忽略
          } else {
            // 未知事件类型，记录但不中断
            console.warn("[DifyProvider] Unknown event type:", chunk.event);
          }
        }
      );

      // 如果流结束但没有收到任何内容，可能是出错了
      if (!hasReceivedContent) {
        console.warn(
          "[DifyProvider] Stream ended without receiving any content"
        );
      }
    } catch (error) {
      console.error("[DifyProvider] Chat stream error:", error);
      onChunk({
        type: "error",
        error: error.message,
      });
    }
  }

  /**
   * 测试 Dify 连接
   * @param {Object} config - Dify 配置
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  static async testConnection(config) {
    try {
      const client = new DifyClient(config);
      const isConnected = await client.testConnection();

      return {
        success: isConnected,
        message: isConnected ? "连接成功" : "连接失败",
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

module.exports = DifyProvider;
