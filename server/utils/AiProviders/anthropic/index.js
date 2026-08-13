const { v4 } = require("uuid");
const {
  writeResponseChunk,
  clientAbortedHandler,
  formatChatHistory,
} = require("../../helpers/chat/responses");
const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const { MODEL_MAP } = require("../modelMap");
const {
  LLMPerformanceMonitor,
} = require("../../helpers/chat/LLMPerformanceMonitor");

class AnthropicLLM {
  constructor(embedder = null, modelPreference = null) {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new Error("No Anthropic API key was set.");

    this.className = "AnthropicLLM";
    // Docs: https://www.npmjs.com/package/@anthropic-ai/sdk
    const AnthropicAI = require("@anthropic-ai/sdk");
    const anthropic = new AnthropicAI({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.anthropic = anthropic;
    this.model =
      modelPreference ||
      process.env.ANTHROPIC_MODEL_PREF ||
      "claude-3-5-sonnet-20241022";
    this.limits = {
      history: this.promptWindowLimit() * 0.15,
      system: this.promptWindowLimit() * 0.15,
      user: this.promptWindowLimit() * 0.7,
    };

    this.embedder = embedder ?? new NativeEmbedder();
    this.defaultTemp = 0.7;

    // Prompt Caching 配置
    this.promptCachingEnabled =
      process.env.ANTHROPIC_PROMPT_CACHING !== "false";
    this.cacheStats = { hits: 0, misses: 0, savedTokens: 0 };

    this.log(`Initialized with ${this.model}`);
    if (this.promptCachingEnabled) {
      this.log(`Prompt Caching enabled`);
    }
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  streamingEnabled() {
    return "streamGetChatCompletion" in this;
  }

  static promptWindowLimit(modelName) {
    return MODEL_MAP.get("anthropic", modelName) ?? 100_000;
  }

  promptWindowLimit() {
    return MODEL_MAP.get("anthropic", this.model) ?? 100_000;
  }

  isValidChatCompletionModel(_modelName = "") {
    return true;
  }

  /**
   * Generates appropriate content array for a message + attachments.
   * @param {{userPrompt:string, attachments: import("../../helpers").Attachment[]}}
   * @returns {string|object[]}
   */
  #generateContent({ userPrompt, attachments = [] }) {
    if (!attachments.length) {
      return userPrompt;
    }

    const content = [{ type: "text", text: userPrompt }];
    for (let attachment of attachments) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachment.mime,
          data: attachment.contentString.split("base64,")[1],
        },
      });
    }
    return content.flat();
  }

  constructPrompt({
    systemPrompt = "",
    contextTexts = [],
    chatHistory = [],
    userPrompt = "",
    attachments = [], // This is the specific attachment for only this prompt
  }) {
    const prompt = {
      role: "system",
      content: `${systemPrompt}${this.#appendContext(contextTexts)}`,
    };

    return [
      prompt,
      ...formatChatHistory(chatHistory, this.#generateContent),
      {
        role: "user",
        content: this.#generateContent({ userPrompt, attachments }),
      },
    ];
  }

  /**
   * 为 Prompt Caching 格式化 system 消息
   * @param {string} systemContent - system prompt 内容
   * @returns {Array} 格式化后的 system 消息数组
   */
  #formatSystemForCaching(systemContent) {
    if (!this.promptCachingEnabled) {
      return systemContent;
    }

    // 将 system prompt 拆分为可缓存的部分
    // 策略：基础指令（可缓存）+ 动态上下文（不缓存）
    const contextMarker = "\nContext:\n";
    const contextIndex = systemContent.indexOf(contextMarker);

    if (contextIndex === -1) {
      // 没有上下文，整个 system prompt 可缓存
      return [
        {
          type: "text",
          text: systemContent,
          cache_control: { type: "ephemeral" },
        },
      ];
    }

    // 有上下文，分开处理
    const basePrompt = systemContent.substring(0, contextIndex);
    const contextPart = systemContent.substring(contextIndex);

    return [
      {
        type: "text",
        text: basePrompt,
        cache_control: { type: "ephemeral" }, // 基础指令缓存
      },
      {
        type: "text",
        text: contextPart, // 动态上下文不缓存
      },
    ];
  }

  async getChatCompletion(messages = null, { temperature = 0.7 }) {
    try {
      const systemContent = this.#formatSystemForCaching(messages[0].content);
      const result = await LLMPerformanceMonitor.measureAsyncFunction(
        this.anthropic.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemContent,
          messages: messages.slice(1),
          temperature: Number(temperature ?? this.defaultTemp),
        })
      );

      const promptTokens = result.output.usage.input_tokens;
      const completionTokens = result.output.usage.output_tokens;

      // 记录缓存统计（如果有）
      this.#updateCacheStats(result.output.usage);

      return {
        textResponse: result.output.content[0].text,
        metrics: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          outputTps: completionTokens / result.duration,
          duration: result.duration,
          cache_creation_input_tokens:
            result.output.usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens:
            result.output.usage.cache_read_input_tokens || 0,
        },
      };
    } catch (error) {
      console.log(error);
      return { textResponse: error, metrics: {} };
    }
  }

  async streamGetChatCompletion(messages = null, { temperature = 0.7 }) {
    const systemContent = this.#formatSystemForCaching(messages[0].content);
    const measuredStreamRequest = await LLMPerformanceMonitor.measureStream(
      this.anthropic.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: systemContent,
        messages: messages.slice(1),
        temperature: Number(temperature ?? this.defaultTemp),
      }),
      messages,
      false
    );

    return measuredStreamRequest;
  }

  /**
   * 更新缓存统计
   * @param {Object} usage - API 返回的 usage 对象
   */
  #updateCacheStats(usage) {
    if (!this.promptCachingEnabled) return;

    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;

    if (cacheRead > 0) {
      this.cacheStats.hits++;
      this.cacheStats.savedTokens += cacheRead;
      this.log(`Cache HIT: saved ${cacheRead} tokens`);
    } else if (cacheCreation > 0) {
      this.cacheStats.misses++;
      this.log(`Cache MISS: created cache with ${cacheCreation} tokens`);
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      enabled: this.promptCachingEnabled,
      hitRate:
        this.cacheStats.hits + this.cacheStats.misses > 0
          ? (
              (this.cacheStats.hits /
                (this.cacheStats.hits + this.cacheStats.misses)) *
              100
            ).toFixed(1) + "%"
          : "N/A",
    };
  }

  /**
   * Handles the stream response from the Anthropic API.
   * @param {Object} response - the response object
   * @param {import('../../helpers/chat/LLMPerformanceMonitor').MonitoredStream} stream - the stream response from the Anthropic API w/tracking
   * @param {Object} responseProps - the response properties
   * @returns {Promise<string>}
   */
  handleStream(response, stream, responseProps) {
    return new Promise((resolve) => {
      let fullText = "";
      const { uuid = v4(), sources = [] } = responseProps;
      let usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
      };

      // Establish listener to early-abort a streaming response
      // in case things go sideways or the user does not like the response.
      // We preserve the generated text but continue as if chat was completed
      // to preserve previously generated content.
      const handleAbort = () => {
        stream?.endMeasurement(usage);
        clientAbortedHandler(resolve, fullText);
      };
      response.on("close", handleAbort);

      stream.on("error", (event) => {
        const parseErrorMsg = (event) => {
          const error = event?.error?.error;
          if (error)
            return `Anthropic Error:${error?.type || "unknown"} ${
              error?.message || "unknown error."
            }`;
          return event.message;
        };

        writeResponseChunk(response, {
          uuid,
          sources: [],
          type: "abort",
          textResponse: null,
          close: true,
          error: parseErrorMsg(event),
        });
        response.removeListener("close", handleAbort);
        stream?.endMeasurement(usage);
        resolve(fullText);
      });

      stream.on("streamEvent", (message) => {
        const data = message;

        if (data.type === "message_start")
          usage.prompt_tokens = data?.message?.usage?.input_tokens;
        if (data.type === "message_delta")
          usage.completion_tokens = data?.usage?.output_tokens;

        if (
          data.type === "content_block_delta" &&
          data.delta.type === "text_delta"
        ) {
          const text = data.delta.text;
          fullText += text;

          writeResponseChunk(response, {
            uuid,
            sources,
            type: "textResponseChunk",
            textResponse: text,
            close: false,
            error: false,
          });
        }

        if (
          message.type === "message_stop" ||
          (data.stop_reason && data.stop_reason === "end_turn")
        ) {
          writeResponseChunk(response, {
            uuid,
            sources,
            type: "textResponseChunk",
            textResponse: "",
            close: true,
            error: false,
          });
          response.removeListener("close", handleAbort);
          stream?.endMeasurement(usage);
          resolve(fullText);
        }
      });
    });
  }

  #appendContext(contextTexts = []) {
    if (!contextTexts || !contextTexts.length) return "";
    return (
      "\nContext:\n" +
      contextTexts
        .map((text, i) => {
          return `[CONTEXT ${i}]:\n${text}\n[END CONTEXT ${i}]\n\n`;
        })
        .join("")
    );
  }

  async compressMessages(promptArgs = {}, rawHistory = []) {
    const { messageStringCompressor } = require("../../helpers/chat");
    const compressedPrompt = await messageStringCompressor(
      this,
      promptArgs,
      rawHistory
    );
    return compressedPrompt;
  }

  // Simple wrapper for dynamic embedder & normalize interface for all LLM implementations
  async embedTextInput(textInput) {
    return await this.embedder.embedTextInput(textInput);
  }
  async embedChunks(textChunks = []) {
    return await this.embedder.embedChunks(textChunks);
  }
}

module.exports = {
  AnthropicLLM,
};
