/**
 * Dify API 客户端
 * 用于与 Dify 平台进行通信
 *
 * API 文档: https://docs.dify.ai/guides/application-publishing/developing-with-apis
 */

const fetch = require("node-fetch");

class DifyClient {
  /**
   * @param {Object} config - Dify 配置
   * @param {string} config.baseUrl - Dify API Base URL (如 https://api.dify.ai/v1)
   * @param {string} config.apiKey - Dify API Key (app-xxx 格式)
   * @param {string} [config.appId] - 应用 ID (可选)
   */
  constructor(config) {
    this.baseUrl =
      config.baseUrl?.replace(/\/$/, "") || "https://api.dify.ai/v1";
    this.apiKey = config.apiKey;
    this.appId = config.appId;

    if (!this.apiKey) {
      throw new Error("Dify API Key is required");
    }
  }

  /**
   * 发送聊天消息 (Chat Completion)
   * @param {Object} params - 请求参数
   * @param {string} params.query - 用户消息
   * @param {string} [params.user] - 用户标识
   * @param {string} [params.conversationId] - 会话 ID (用于多轮对话)
   * @param {Object} [params.inputs] - 额外输入变量
   * @param {boolean} [params.responseMode='blocking'] - 响应模式: 'blocking' | 'streaming'
   * @returns {Promise<Object>} Dify API 响应
   */
  async chat(params) {
    const {
      query,
      user = "default-user",
      conversationId = null,
      inputs = {},
      responseMode = "blocking",
    } = params;

    try {
      const response = await fetch(`${this.baseUrl}/chat-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          user,
          conversation_id: conversationId,
          inputs,
          response_mode: responseMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Dify API error: ${response.status} - ${errorData.message || response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("[DifyClient] Chat error:", error);
      throw error;
    }
  }

  /**
   * 发送流式聊天消息
   * @param {Object} params - 请求参数
   * @param {Function} onChunk - 接收数据块的回调函数
   * @returns {Promise<void>}
   */
  async chatStream(params, onChunk) {
    const {
      query,
      user = "default-user",
      conversationId = null,
      inputs = {},
    } = params;

    try {
      const response = await fetch(`${this.baseUrl}/chat-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          user,
          conversation_id: conversationId,
          inputs,
          response_mode: "streaming",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Dify API error: ${response.status} - ${errorData.message || response.statusText}`
        );
      }

      // 处理 SSE 流
      const reader = response.body;
      let buffer = "";

      // 使用 Promise 包装事件监听器，确保等待流结束
      await new Promise((resolve, reject) => {
        reader.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // 保留不完整的行

          for (const line of lines) {
            // 跳过空行
            if (!line.trim()) {
              continue;
            }

            // 处理 SSE 数据行
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();

              // 跳过空数据
              if (!data) {
                continue;
              }

              // 处理结束标记
              if (data === "[DONE]") {
                onChunk({ done: true });
                resolve();
                return;
              }

              // 尝试解析 JSON
              try {
                const parsed = JSON.parse(data);
                onChunk(parsed);
              } catch (e) {
                // 如果不是 JSON，记录警告但不中断流
                console.warn("[DifyClient] Received non-JSON SSE data:", data);
                console.warn("[DifyClient] Parse error:", e.message);
                // 不抛出错误，继续处理后续数据
              }
            }
          }
        });

        reader.on("end", () => {
          onChunk({ done: true });
          resolve();
        });

        reader.on("error", (error) => {
          console.error("[DifyClient] Stream error:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("[DifyClient] Chat stream error:", error);
      throw error;
    }
  }

  /**
   * 测试连接
   * @returns {Promise<boolean>} 连接是否成功
   */
  async testConnection() {
    try {
      // 发送一个简单的测试消息
      await this.chat({
        query: "Hello",
        user: "test-user",
      });
      return true;
    } catch (error) {
      console.error("[DifyClient] Connection test failed:", error);
      return false;
    }
  }
}

module.exports = DifyClient;
