const OpenAI = require("openai");
const Provider = require("./ai-provider.js");
const { RetryError } = require("../error.js");
const { safeJsonParse } = require("../../../http");
const { v4 } = require("uuid");

/**
 * The agent provider for the OpenRouter provider.
 * 支持原生 Tool Calling，适用于 Claude、GPT-4 等通过 OpenRouter 访问的模型。
 */
class OpenRouterProvider extends Provider {
  model;

  constructor(config = {}) {
    const { model = "openrouter/auto" } = config;
    super();
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      maxRetries: 3,
      defaultHeaders: {
        "HTTP-Referer": "https://alata.studio",
        "X-Title": "Alata",
      },
    });

    this._client = client;
    this.model = model;
    this.verbose = true;
  }

  get client() {
    return this._client;
  }

  get supportsAgentStreaming() {
    return true;
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
        // 如果没有 originalFunctionCall，无法正确映射 tool_call_id
        if (!message.hasOwnProperty("originalFunctionCall")) {
          this.providerLog(
            "[OpenRouter.#formatMessages]: message did not pass back the originalFunctionCall."
          );
          return;
        }

        formattedMessages.push(
          {
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
          },
          {
            role: "tool",
            tool_call_id: message.originalFunctionCall.id,
            content: message.content,
          }
        );
        return;
      }

      formattedMessages.push({
        role: message.role,
        content: message.content,
      });
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
   * 流式聊天补全，支持原生 Tool Calling
   * @param {any[]} messages - 消息数组
   * @param {any[]} functions - 工具定义数组
   * @param {function} eventHandler - 事件处理器
   * @returns {Promise<{functionCall: any, textResponse: string}>}
   */
  async stream(messages, functions = [], eventHandler = null) {
    this.providerLog("OpenRouter.stream - will process this chat completion.");
    try {
      const msgUUID = v4();
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.#formatMessages(messages),
        stream: true,
        ...(Array.isArray(functions) && functions?.length > 0
          ? { tools: this.#formatFunctions(functions), tool_choice: "auto" }
          : {}),
      });

      const completion = {
        content: "",
        functionCall: null,
      };

      // 用于累积流式 tool_calls
      let toolCallBuffer = null;

      for await (const streamEvent of response) {
        const chunk = streamEvent;
        const choice = chunk?.choices?.[0];
        if (!choice) continue;

        const { content, tool_calls } = choice.delta || {};

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
        return {
          textResponse: completion.content,
          functionCall: completion.functionCall,
          cost: this.getCost(),
        };
      }

      return {
        textResponse: completion.content,
        functionCall: null,
        cost: this.getCost(),
      };
    } catch (error) {
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
    this.providerLog(
      "OpenRouter.complete - will process this chat completion."
    );
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        stream: false,
        messages: this.#formatMessages(messages),
        ...(Array.isArray(functions) && functions?.length > 0
          ? { tools: this.#formatFunctions(functions), tool_choice: "auto" }
          : {}),
      });

      const completion = response.choices[0].message;
      const cost = this.getCost(response.usage);

      // 检查是否有工具调用
      if (completion?.tool_calls?.length > 0) {
        const toolCall = completion.tool_calls[0];
        const functionArgs = safeJsonParse(toolCall.function.arguments, {});
        return {
          textResponse: completion.content || null,
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: functionArgs,
          },
          cost,
        };
      }

      return {
        textResponse: completion.content,
        functionCall: null,
        cost,
      };
    } catch (error) {
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

module.exports = OpenRouterProvider;
