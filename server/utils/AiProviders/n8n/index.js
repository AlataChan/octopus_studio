/**
 * n8n Provider
 * 提供统一的 n8n Webhook 接口
 */

const N8nClient = require("./N8nClient");

class N8nProvider {
  /**
   * 调用 Webhook (阻塞式)
   * @param {Object} config - n8n 配置
   * @param {string} message - 用户消息
   * @param {Object} options - 可选参数
   * @returns {Promise<Object>}
   */
  static async chat(config, message, options = {}) {
    try {
      const client = new N8nClient(config);
      const result = await client.call({
        message,
        userId: options.userId,
        sessionId: options.sessionId,
        extraData: options.extraData,
      });

      return {
        success: true,
        content: result.content,
        metadata: {
          platform: "n8n",
          webhookUrl: config.webhookUrl,
        },
        raw: result.raw,
      };
    } catch (error) {
      console.error("[n8n Provider] Call error:", error);
      return {
        success: false,
        error: error.message,
        content: null,
      };
    }
  }

  /**
   * 调用 Webhook (流式)
   * @param {Object} config - n8n 配置
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 接收数据块的回调函数
   * @param {Object} options - 可选参数
   * @returns {Promise<void>}
   */
  static async chatStream(config, message, onChunk, options = {}) {
    try {
      const client = new N8nClient(config);

      await client.callStream(
        {
          message,
          userId: options.userId,
          sessionId: options.sessionId,
          extraData: options.extraData,
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
              metadata: {
                platform: "n8n",
                webhookUrl: config.webhookUrl,
              },
            });
          }
        }
      );
    } catch (error) {
      console.error("[n8n Provider] Stream error:", error);
      onChunk({
        type: "error",
        error: error.message,
      });
    }
  }

  /**
   * 测试连接
   * @param {Object} config - n8n 配置
   * @returns {Promise<Object>}
   */
  static async testConnection(config) {
    try {
      const client = new N8nClient(config);
      return await client.testConnection();
    } catch (error) {
      return {
        success: false,
        message: `n8n 配置错误: ${error.message}`,
      };
    }
  }
}

module.exports = N8nProvider;
