const OpenAI = require("openai");
const Provider = require("./ai-provider.js");
const { RetryError } = require("../error.js");
const { safeJsonParse, toValidNumber } = require("../../../http/index.js");
const { v4 } = require("uuid");

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 判断错误是否为可重试的网络错误
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
function isRetryableNetworkError(error) {
  const message = error?.message || "";
  return (
    message.includes("Premature close") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") || // "Request timed out" 等
    message.includes("Timed out") || // 大写变体
    message.includes("Connection error") ||
    message.includes("Invalid response body")
  );
}

/**
 * DeepSeek Provider - 支持原生 Tool Calling
 * DeepSeek 官方支持 Function Calling，格式兼容 OpenAI API
 */
class DeepSeekProvider extends Provider {
  model;

  constructor(config = {}) {
    super();
    const { model = "deepseek-chat" } = config;

    // DeepSeek 官方文档：高负载时请求可能需要等待很长时间，30分钟后服务器会关闭连接
    // 配置较长的超时时间（5分钟），并在 Provider 内部做重试
    const client = new OpenAI({
      baseURL: "https://api.deepseek.com/v1",
      apiKey: process.env.DEEPSEEK_API_KEY ?? null,
      maxRetries: 0, // 禁用 SDK 内置重试，由我们自己控制
      timeout: 5 * 60 * 1000, // 5 分钟超时
    });

    this._client = client;
    this.model = model;
    this.verbose = true;

    // DeepSeek 文档：deepseek-chat 默认输出 4K，最大 8K
    const DEFAULT_MAX_TOKENS = 4096;
    const HARD_MAX_TOKENS = 8000;
    const configuredMax = process.env.DEEPSEEK_MAX_TOKENS
      ? toValidNumber(process.env.DEEPSEEK_MAX_TOKENS, DEFAULT_MAX_TOKENS)
      : DEFAULT_MAX_TOKENS;
    this.maxTokens = Math.min(configuredMax, HARD_MAX_TOKENS);

    // Provider 级别的重试配置
    this.maxNetworkRetries = 5;
    this.baseRetryDelay = 3000;
  }

  get client() {
    return this._client;
  }

  get supportsAgentStreaming() {
    return true;
  }

  /** Cap2: provider supports extended-thinking reasoning stream */
  get supportsReasoningStream() {
    return true;
  }

  /** Cap2: reasoning is emitted as raw delta text (not summarised) */
  get reasoningKind() {
    return "raw";
  }

  /**
   * 格式化消息，处理 function 类型消息转换为 OpenAI tool 格式
   * @param {any[]} messages - 消息数组
   * @returns {any[]} 格式化后的消息
   */
  #formatMessages(messages) {
    const formattedMessages = [];
    messages.forEach((message) => {
      if (message.role === "function") {
        if (!message.hasOwnProperty("originalFunctionCall")) {
          this.providerLog(
            "[DeepSeek.#formatMessages]: message did not pass back the originalFunctionCall."
          );
          return;
        }

        const assistantMessage = {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: {
                arguments: JSON.stringify(
                  message.originalFunctionCall.arguments
                ),
                name: message.originalFunctionCall.name,
              },
              id: message.originalFunctionCall.id,
            },
          ],
        };
        const reasoningContent =
          message.originalFunctionCall?.reasoning_content ??
          message.originalFunctionCall?.reasoningContent;
        if (
          typeof reasoningContent === "string" &&
          reasoningContent.length > 0
        ) {
          assistantMessage.reasoning_content = reasoningContent;
        }

        formattedMessages.push(
          assistantMessage,
          {
            role: "tool",
            tool_call_id: message.originalFunctionCall.id,
            content: message.content,
          }
        );
        return;
      }

      const formattedMessage = {
        role: message.role,
        content: message.content,
      };
      const reasoningContent =
        message.role === "assistant"
          ? message.reasoning_content ?? message.reasoningContent
          : null;
      if (
        typeof reasoningContent === "string" &&
        reasoningContent.length > 0
      ) {
        formattedMessage.reasoning_content = reasoningContent;
      }
      formattedMessages.push(formattedMessage);
    });

    return formattedMessages;
  }

  /**
   * 格式化工具定义为 OpenAI function calling 格式
   * @param {any[]} functions - 工具定义数组
   * @returns {any[]} OpenAI 格式的工具定义
   */
  #formatFunctions(functions) {
    return functions.map((func) => ({
      type: "function",
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters,
      },
    }));
  }

  /**
   * 执行单次 API 调用，带网络错误重试（支持 tools 参数）
   * @param {Object} options - API 调用选项
   * @param {Array} options.messages - 消息数组
   * @param {Array} options.tools - 工具定义数组（可选）
   * @param {boolean} options.stream - 是否流式（可选）
   * @returns {Promise<Object>} API 响应
   */
  async #callWithRetry({ messages, tools = null, stream = false }) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxNetworkRetries; attempt++) {
      try {
        console.log(
          `[DeepSeek] API call attempt ${attempt}/${this.maxNetworkRetries}`
        );

        const result = await this.client.chat.completions.create({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          stream,
          ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        });

        if (attempt > 1) {
          console.log(
            `[DeepSeek] API call succeeded after ${attempt} attempts`
          );
        }
        return result;
      } catch (error) {
        lastError = error;

        // 处理内容安全审核拦截
        if (
          error?.error?.message?.includes("Content Exists Risk") ||
          error?.message?.includes("Content Exists Risk")
        ) {
          console.error(
            "[DeepSeek] Content safety filter triggered:",
            error.message
          );
          throw error; // 不重试内容安全错误
        }

        const isRetryable = isRetryableNetworkError(error);

        console.error(
          `[DeepSeek] API call failed (attempt ${attempt}/${this.maxNetworkRetries}):`,
          error.message || error
        );

        if (!isRetryable) {
          console.error(`[DeepSeek] Non-retryable error, stopping retries`);
          throw error;
        }

        if (attempt < this.maxNetworkRetries) {
          const waitTime = this.baseRetryDelay * Math.pow(2, attempt - 1);
          console.log(
            `[DeepSeek] Network error, waiting ${waitTime}ms before retry...`
          );
          await delay(waitTime);
        }
      }
    }

    console.error(
      `[DeepSeek] All ${this.maxNetworkRetries} retry attempts failed`
    );
    throw new Error(
      `DeepSeek API error after ${this.maxNetworkRetries} retries: ${lastError?.message || "Unknown error"}`
    );
  }

  /**
   * 流式聊天补全，支持原生 Tool Calling
   * @param {any[]} messages - 消息数组
   * @param {any[]} functions - 工具定义数组
   * @param {function} eventHandler - 事件处理器
   * @returns {Promise<{functionCall: any, textResponse: string}>}
   */
  async stream(messages, functions = [], eventHandler = null) {
    this.providerLog("DeepSeek.stream - will process this chat completion.");
    try {
      const msgUUID = v4();
      const formattedMessages = this.#formatMessages(messages);
      const tools =
        functions.length > 0 ? this.#formatFunctions(functions) : null;

      const response = await this.#callWithRetry({
        messages: formattedMessages,
        tools,
        stream: true,
      });

      const completion = {
        content: "",
        functionCall: null,
        reasoningContent: "",
      };

      // 用于累积流式 tool_calls
      let toolCallBuffer = null;

      for await (const streamEvent of response) {
        const chunk = streamEvent;
        const choice = chunk?.choices?.[0];
        if (!choice) continue;

        const { content, reasoning_content, tool_calls } = choice.delta || {};

        // Cap2: 处理推理内容（reasoning_content）— 仅触发事件，不写入 textResponse
        if (reasoning_content) {
          completion.reasoningContent += reasoning_content;
          eventHandler?.("reasoning", { content: reasoning_content });
        }

        // 处理文本内容
        if (content) {
          completion.content += content;
          eventHandler?.("reportStreamEvent", {
            type: "textResponseChunk",
            uuid: msgUUID,
            content,
          });
        }

        // 处理工具调用（流式累积）
        if (tool_calls && tool_calls.length > 0) {
          const toolCall = tool_calls[0];

          if (toolCall.id) {
            // 新的工具调用开始
            toolCallBuffer = {
              id: toolCall.id,
              name: toolCall.function?.name || "",
              arguments: toolCall.function?.arguments || "",
            };
          } else if (toolCallBuffer) {
            // 继续累积参数
            if (toolCall.function?.name) {
              toolCallBuffer.name += toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCallBuffer.arguments += toolCall.function.arguments;
            }
          }

          if (toolCallBuffer) {
            eventHandler?.("reportStreamEvent", {
              type: "toolCallInvocation",
              uuid: `${msgUUID}:tool_call_invocation`,
              content: `Assembling Tool Call: ${toolCallBuffer.name}(${toolCallBuffer.arguments})`,
            });
          }
        }
      }

      // 处理最终的工具调用
      if (toolCallBuffer && toolCallBuffer.name) {
        completion.functionCall = {
          id: toolCallBuffer.id,
          name: toolCallBuffer.name,
          arguments: safeJsonParse(toolCallBuffer.arguments, {}),
        };
      }

      if (completion.functionCall) {
        if (completion.reasoningContent) {
          completion.functionCall.reasoning_content =
            completion.reasoningContent;
        }
        return {
          textResponse: completion.content,
          functionCall: completion.functionCall,
          reasoningContent: completion.reasoningContent,
          cost: this.getCost(),
        };
      }

      return {
        textResponse: completion.content,
        functionCall: null,
        reasoningContent: completion.reasoningContent,
        cost: this.getCost(),
      };
    } catch (error) {
      // 处理内容安全审核错误，返回友好提示
      if (
        error?.error?.message?.includes("Content Exists Risk") ||
        error?.message?.includes("Content Exists Risk")
      ) {
        return {
          textResponse:
            "⚠️ **内容安全提示**\n\n您提交的内容触发了 AI 模型的安全审核机制，无法处理此请求。\n\n可能的原因：\n- 文档内容包含敏感关键词\n- 内容长度过长或格式异常\n\n建议：\n1. 尝试使用其他 AI 模型（如 GPT-4、Claude）\n2. 检查并修改文档中可能触发安全检测的内容",
          functionCall: null,
          cost: 0,
        };
      }

      if (error instanceof OpenAI.AuthenticationError) throw error;
      if (
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIError
      ) {
        throw new RetryError(error.message);
      }
      throw error;
    }
  }

  /**
   * 非流式聊天补全，支持原生 Tool Calling
   * @param {any[]} messages - 消息数组
   * @param {any[]} functions - 工具定义数组
   * @returns {Promise<{functionCall: any, textResponse: string}>}
   */
  async complete(messages, functions = []) {
    this.providerLog("DeepSeek.complete - will process this chat completion.");
    try {
      const formattedMessages = this.#formatMessages(messages);
      const tools =
        functions.length > 0 ? this.#formatFunctions(functions) : null;

      const response = await this.#callWithRetry({
        messages: formattedMessages,
        tools,
        stream: false,
      });

      const completion = response.choices[0].message;
      const cost = this.getCost(response.usage);

      // 检查是否有工具调用
      if (completion?.tool_calls?.length > 0) {
        const toolCall = completion.tool_calls[0];
        const functionArgs = safeJsonParse(toolCall.function.arguments, {});
        const reasoningContent = completion?.reasoning_content;
        return {
          textResponse: completion.content || null,
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: functionArgs,
            ...(reasoningContent
              ? { reasoning_content: reasoningContent }
              : {}),
          },
          ...(reasoningContent ? { reasoningContent } : {}),
          cost,
        };
      }

      return {
        textResponse: completion.content,
        functionCall: null,
        ...(completion?.reasoning_content
          ? { reasoningContent: completion.reasoning_content }
          : {}),
        cost,
      };
    } catch (error) {
      // 处理内容安全审核错误
      if (
        error?.error?.message?.includes("Content Exists Risk") ||
        error?.message?.includes("Content Exists Risk")
      ) {
        return {
          textResponse:
            "⚠️ **内容安全提示**\n\n您提交的内容触发了 AI 模型的安全审核机制，无法处理此请求。",
          functionCall: null,
          cost: 0,
        };
      }

      if (error instanceof OpenAI.AuthenticationError) throw error;
      if (
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIError
      ) {
        throw new RetryError(error.message);
      }
      throw error;
    }
  }

  /**
   * Get the cost of the completion.
   * @param _usage The completion to get the cost for.
   * @returns The cost of the completion.
   */
  getCost(_usage) {
    return 0;
  }
}

module.exports = DeepSeekProvider;
