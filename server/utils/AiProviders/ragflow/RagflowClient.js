/**
 * RAGFlow API 客户端
 * 用于与 RAGFlow 平台进行交互
 *
 * RAGFlow 提供两种 API:
 * 1. Chat API: /api/v1/chats_openai/{chat_id}/chat/completions
 * 2. Agent API: /api/v1/agents_openai/{agent_id}/chat/completions
 *
 * 两者都兼容 OpenAI 的 API 格式
 */

const fetch = require("node-fetch");

class RagflowClient {
  /**
   * Normalize a RAGFlow baseUrl that may include /v1 or /api/v1.
   * @param {string} baseUrl
   * @returns {{rootBaseUrl: string, webBaseUrl: string, sdkBaseUrl: string}}
   */
  static normalizeBaseUrls(baseUrl = "") {
    const trimmed = String(baseUrl || "").replace(/\/+$/, "");
    if (!trimmed) {
      return { rootBaseUrl: "", webBaseUrl: "", sdkBaseUrl: "" };
    }

    let rootBaseUrl = trimmed;
    if (rootBaseUrl.endsWith("/api/v1")) {
      rootBaseUrl = rootBaseUrl.slice(0, -"/api/v1".length);
    } else if (rootBaseUrl.endsWith("/v1")) {
      rootBaseUrl = rootBaseUrl.slice(0, -"/v1".length);
    }

    rootBaseUrl = rootBaseUrl.replace(/\/+$/, "");
    return {
      rootBaseUrl,
      webBaseUrl: `${rootBaseUrl}/v1`,
      sdkBaseUrl: `${rootBaseUrl}/api/v1`,
    };
  }

  /**
   * 构造函数
   * @param {Object} config - RAGFlow 配置
   * @param {string} config.baseUrl - RAGFlow API 基础 URL (如: https://your-ragflow.com)
   * @param {string} config.apiKey - RAGFlow API Key
   * @param {string} config.type - 类型: 'chat' 或 'agent'
   * @param {string} config.chatId - Chat ID (当 type='chat' 时必需)
   * @param {string} config.agentId - Agent ID (当 type='agent' 时必需)
   */
  constructor(config) {
    const { rootBaseUrl, webBaseUrl, sdkBaseUrl } =
      RagflowClient.normalizeBaseUrls(config.baseUrl);
    this.rootBaseUrl = rootBaseUrl;
    this.webBaseUrl = webBaseUrl;
    this.sdkBaseUrl = sdkBaseUrl;
    this.apiKey = config.apiKey;
    this.type = config.type || "chat"; // 默认使用 chat
    this.chatId = config.chatId;
    this.agentId = config.agentId;

    if (!this.rootBaseUrl || !this.apiKey) {
      throw new Error("RAGFlow baseUrl and apiKey are required");
    }

    if (this.type === "chat" && !this.chatId) {
      throw new Error("chatId is required when type is 'chat'");
    }

    if (this.type === "agent" && !this.agentId) {
      throw new Error("agentId is required when type is 'agent'");
    }
  }

  /**
   * 获取完整的 API 端点
   * @returns {string}
   */
  getOpenAIEndpoint() {
    if (this.type === "chat") {
      return `${this.sdkBaseUrl}/chats_openai/${this.chatId}/chat/completions`;
    }
    return `${this.sdkBaseUrl}/agents_openai/${this.agentId}/chat/completions`;
  }

  // Backwards-compat alias.
  getEndpoint() {
    return this.getOpenAIEndpoint();
  }

  /**
   * Iterate over SSE `data:` payload strings.
   * @param {import("stream").Readable} readable
   */
  async *iterateSSEDataStrings(readable) {
    let buffer = "";
    // eslint-disable-next-line no-restricted-syntax
    for await (const chunk of readable) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;
        const dataStr = trimmedLine.substring(5).trim();
        if (dataStr) yield dataStr;
      }
    }
  }

  /**
   * 阻塞式聊天
   * @param {Object} params - 聊天参数
   * @param {string} params.message - 用户消息
   * @param {string} params.userId - 用户 ID (可选)
   * @param {string} params.sessionId - 会话 ID (可选，用于多轮对话)
   * @returns {Promise<Object>} 聊天响应
   */
  async chat(params) {
    const { message, userId = "default-user", sessionId } = params;

    const requestBody = {
      model: "ragflow", // RAGFlow 会自动解析，可以设置任意值
      messages: [{ role: "user", content: message }],
      stream: false,
    };

    // Agent API 支持 session_id
    if (this.type === "agent" && sessionId) {
      requestBody.session_id = sessionId;
    }

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `RAGFlow API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();

    // 提取响应内容
    const content = data.choices?.[0]?.message?.content || "";
    const reference = data.choices?.[0]?.message?.reference || null;

    return {
      content,
      reference,
      messageId: data.id,
      sessionId: data.session_id || sessionId,
      usage: data.usage,
      raw: data,
    };
  }

  /**
   * 流式聊天
   * @param {Object} params - 聊天参数
   * @param {string} params.message - 用户消息
   * @param {string} params.userId - 用户 ID (可选)
   * @param {string} params.sessionId - 会话 ID (可选)
   * @param {Function} onChunk - 接收数据块的回调函数
   * @returns {Promise<void>}
   */
  async chatStream(params, onChunk) {
    const { message, userId = "default-user", sessionId } = params;

    const requestBody = {
      model: "ragflow",
      messages: [{ role: "user", content: message }],
      stream: true,
    };

    if (this.type === "agent" && sessionId) {
      requestBody.session_id = sessionId;
    }

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `RAGFlow API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    // 处理 SSE 流
    let fullContent = "";
    let messageId = null;
    let finalSessionId = sessionId;
    let reference = null;

    // 逐行读取响应
    const reader = response.body;
    let buffer = "";

    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        const dataStr = trimmedLine.substring(5).trim();
        if (dataStr === "[DONE]") {
          // 流结束
          onChunk({
            type: "done",
            content: fullContent,
            messageId,
            sessionId: finalSessionId,
            reference,
          });
          return;
        }

        try {
          const data = JSON.parse(dataStr);
          messageId = data.id || messageId;
          finalSessionId = data.session_id || finalSessionId;

          // 提取内容
          const delta =
            data.choices?.[0]?.delta?.content || data.data?.content || "";
          if (delta) {
            fullContent += delta;
            onChunk({ type: "content", delta });
          }

          // 提取引用 (通常在最后一个块中)
          const chunkReference =
            data.choices?.[0]?.delta?.reference || data.data?.reference;
          if (chunkReference) {
            reference = chunkReference;
          }
        } catch (error) {
          console.error("[RAGFlow] Failed to parse SSE data:", error);
        }
      }
    }
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} { success: boolean, message: string }
   */
  async testConnection() {
    try {
      // 发送一个简单的测试消息
      await this.chat({ message: "Hello", userId: "test-user" });
      return {
        success: true,
        message: "RAGFlow 连接测试成功",
      };
    } catch (error) {
      return {
        success: false,
        message: `RAGFlow 连接失败: ${error.message}`,
      };
    }
  }
}

module.exports = RagflowClient;
