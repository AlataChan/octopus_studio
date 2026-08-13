/**
 * n8n Webhook 客户端
 * 用于调用 n8n 工作流的 Webhook 端点
 *
 * n8n 通过 Webhook 触发器接收请求，可以构建复杂的 AI Agent 工作流
 */

const fetch = require("node-fetch");

class N8nClient {
  /**
   * 构造函数
   * @param {Object} config - n8n 配置
   * @param {string} config.webhookUrl - Webhook URL (完整 URL)
   * @param {string} config.method - HTTP 方法 (默认: POST)
   * @param {Object} config.headers - 自定义请求头 (可选)
   * @param {string} config.requestTemplate - 请求体模板 (支持变量替换)
   * @param {string} config.responsePath - 响应内容的 JSON 路径 (如: "data.response")
   * @param {boolean} config.streamSupport - 是否支持流式响应 (默认: false)
   */
  constructor(config) {
    this.webhookUrl = config.webhookUrl;
    this.method = config.method || "POST";
    this.headers = config.headers || {};
    this.requestTemplate =
      config.requestTemplate || '{"message": "{{message}}"}';
    this.responsePath = config.responsePath || "response";
    this.streamSupport = config.streamSupport || false;

    if (!this.webhookUrl) {
      throw new Error("n8n webhookUrl is required");
    }
  }

  /**
   * 替换模板中的变量
   * @param {string} template - 模板字符串
   * @param {Object} variables - 变量对象
   * @returns {string}
   */
  replaceVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * 从响应中提取内容
   * @param {Object} data - 响应数据
   * @param {string} path - JSON 路径 (如: "data.response")
   * @returns {string}
   */
  extractContent(data, path) {
    const keys = path.split(".");
    let result = data;

    for (const key of keys) {
      if (result && typeof result === "object" && key in result) {
        result = result[key];
      } else {
        return "";
      }
    }

    return typeof result === "string" ? result : JSON.stringify(result);
  }

  /**
   * 调用 Webhook (阻塞式)
   * @param {Object} params - 调用参数
   * @param {string} params.message - 用户消息
   * @param {string} params.userId - 用户 ID (可选)
   * @param {string} params.sessionId - 会话 ID (可选)
   * @param {Object} params.extraData - 额外数据 (可选)
   * @returns {Promise<Object>}
   */
  async call(params) {
    const {
      message,
      userId = "default-user",
      sessionId,
      extraData = {},
    } = params;

    // 准备变量
    const variables = {
      message,
      userId,
      sessionId: sessionId || "",
      ...extraData,
    };

    // 替换请求模板
    const requestBody = this.replaceVariables(this.requestTemplate, variables);

    const response = await fetch(this.webhookUrl, {
      method: this.method,
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `n8n Webhook error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();

    // 提取响应内容
    const content = this.extractContent(data, this.responsePath);

    return {
      content,
      raw: data,
    };
  }

  /**
   * 调用 Webhook (流式 - 如果支持)
   * @param {Object} params - 调用参数
   * @param {Function} onChunk - 接收数据块的回调函数
   * @returns {Promise<void>}
   */
  async callStream(params, onChunk) {
    if (!this.streamSupport) {
      // 如果不支持流式，回退到阻塞式
      const result = await this.call(params);
      onChunk({ type: "content", delta: result.content });
      onChunk({ type: "done", content: result.content });
      return;
    }

    // 流式实现 (需要 n8n 工作流支持 SSE)
    const {
      message,
      userId = "default-user",
      sessionId,
      extraData = {},
    } = params;

    const variables = {
      message,
      userId,
      sessionId: sessionId || "",
      ...extraData,
    };

    const requestBody = this.replaceVariables(this.requestTemplate, variables);

    const response = await fetch(this.webhookUrl, {
      method: this.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...this.headers,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `n8n Webhook error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    // 处理 SSE 流
    let fullContent = "";
    const reader = response.body;
    let buffer = "";

    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        const dataStr = trimmedLine.substring(5).trim();
        if (dataStr === "[DONE]") {
          onChunk({ type: "done", content: fullContent });
          return;
        }

        try {
          const data = JSON.parse(dataStr);
          const delta = this.extractContent(data, this.responsePath);
          if (delta) {
            fullContent += delta;
            onChunk({ type: "content", delta });
          }
        } catch (error) {
          console.error("[n8n] Failed to parse SSE data:", error);
        }
      }
    }
  }

  /**
   * 测试连接
   * @returns {Promise<Object>}
   */
  async testConnection() {
    try {
      await this.call({ message: "Hello", userId: "test-user" });
      return {
        success: true,
        message: "n8n Webhook 连接测试成功",
      };
    } catch (error) {
      return {
        success: false,
        message: `n8n Webhook 连接失败: ${error.message}`,
      };
    }
  }
}

module.exports = N8nClient;
