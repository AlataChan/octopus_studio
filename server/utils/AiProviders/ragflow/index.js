/**
 * RAGFlow Provider
 * 提供统一的 RAGFlow 平台接口
 */

const RagflowClient = require("./RagflowClient");

class RagflowProvider {
  /**
   * 聊天 (阻塞式)
   * @param {Object} config - RAGFlow 配置
   * @param {string} message - 用户消息
   * @param {Object} options - 可选参数
   * @param {string} options.userId - 用户 ID
   * @param {string} options.sessionId - 会话 ID (用于多轮对话)
   * @returns {Promise<Object>} 统一格式的响应
   */
  static async chat(config, message, options = {}) {
    try {
      const client = new RagflowClient(config);
      const result = await client.chat({
        message,
        userId: options.userId,
        sessionId: options.sessionId,
      });

      return {
        success: true,
        content: result.content,
        sessionId: result.sessionId,
        messageId: result.messageId,
        reference: result.reference, // RAGFlow 特有的引用信息
        metadata: {
          platform: "ragflow",
          type: config.type || "chat",
          usage: result.usage,
        },
        raw: result.raw,
      };
    } catch (error) {
      console.error("[RAGFlow Provider] Chat error:", error);
      return {
        success: false,
        error: error.message,
        content: null,
      };
    }
  }

  /**
   * 聊天 (流式)
   * @param {Object} config - RAGFlow 配置
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 接收数据块的回调函数
   * @param {Object} options - 可选参数
   * @returns {Promise<void>}
   */
  static async chatStream(config, message, onChunk, options = {}) {
    try {
      const client = new RagflowClient(config);

      await client.chatStream(
        {
          message,
          userId: options.userId,
          sessionId: options.sessionId,
        },
        (chunk) => {
          if (chunk.type === "content") {
            onChunk({
              type: "content",
              delta: chunk.delta,
            });
          } else if (chunk.type === "done") {
            onChunk({
              type: "done",
              content: chunk.content,
              sessionId: chunk.sessionId,
              messageId: chunk.messageId,
              reference: chunk.reference,
              metadata: {
                platform: "ragflow",
                type: config.type || "chat",
              },
            });
          }
        }
      );
    } catch (error) {
      console.error("[RAGFlow Provider] Stream error:", error);
      onChunk({
        type: "error",
        error: error.message,
      });
    }
  }

  /**
   * 测试连接
   * @param {Object} config - RAGFlow 配置
   * @returns {Promise<Object>} { success: boolean, message: string }
   */
  static async testConnection(config) {
    try {
      const client = new RagflowClient(config);
      return await client.testConnection();
    } catch (error) {
      return {
        success: false,
        message: `RAGFlow 配置错误: ${error.message}`,
      };
    }
  }
}

module.exports = RagflowProvider;
