/**
 * A service that provides an AI client to create a completion.
 */

/**
 * @typedef {Object} LangChainModelConfig
 * @property {(string|null)} baseURL - Override the default base URL process.env for this provider
 * @property {(string|null)} apiKey - Override the default process.env for this provider
 * @property {(number|null)} temperature - Override the default temperature
 * @property {(string|null)} model -  Overrides model used for provider.
 */

const { v4 } = require("uuid");
const { ChatOpenAI } = require("@langchain/openai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { toValidNumber, safeJsonParse } = require("../../../http");
const { getLLMProviderClass } = require("../../../helpers");
const { parseLMStudioBasePath } = require("../../../AiProviders/lmStudio");
const {
  SystemPromptVariables,
} = require("../../../../models/systemPromptVariables");
const { enhanceSystemPrompt, COT_MODES } = require("../../cot");

const DEFAULT_WORKSPACE_PROMPT =
  "You are a helpful ai assistant who can assist the user and use tools available to help answer the users prompts and questions.";

class Provider {
  _client;
  constructor(client) {
    if (this.constructor == Provider) {
      return;
    }
    this._client = client;
  }

  providerLog(text, ...args) {
    console.log(
      `\x1b[36m[AgentLLM${this?.model ? ` - ${this.model}` : ""}]\x1b[0m ${text}`,
      ...args
    );
  }

  get client() {
    return this._client;
  }

  /**
   *
   * @param {string} provider - the string key of the provider LLM being loaded.
   * @param {LangChainModelConfig} config - Config to be used to override default connection object.
   * @returns
   */
  static LangChainChatModel(provider = "openai", config = {}) {
    switch (provider) {
      // Cloud models
      case "openai":
        return new ChatOpenAI({
          apiKey: process.env.OPEN_AI_KEY,
          ...config,
        });
      case "anthropic":
        return new ChatAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          ...config,
        });
      case "groq":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.groq.com/openai/v1",
          },
          apiKey: process.env.GROQ_API_KEY,
          ...config,
        });
      case "mistral":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.mistral.ai/v1",
          },
          apiKey: process.env.MISTRAL_API_KEY ?? null,
          ...config,
        });
      case "openrouter":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": "https://alata.studio",
              "X-Title": "Alata",
            },
          },
          apiKey: process.env.OPENROUTER_API_KEY ?? null,
          ...config,
        });
      case "perplexity":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.perplexity.ai",
          },
          apiKey: process.env.PERPLEXITY_API_KEY ?? null,
          ...config,
        });
      case "togetherai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.together.xyz/v1",
          },
          apiKey: process.env.TOGETHER_AI_API_KEY ?? null,
          ...config,
        });
      case "generic-openai":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.GENERIC_OPEN_AI_BASE_PATH,
          },
          apiKey: process.env.GENERIC_OPEN_AI_API_KEY,
          maxTokens: toValidNumber(
            process.env.GENERIC_OPEN_AI_MAX_TOKENS,
            1024
          ),
          ...config,
        });
      case "aihubmix":
        return new ChatOpenAI({
          configuration: {
            baseURL:
              process.env.AIHUBMIX_BASE_PATH || "https://aihubmix.com/v1",
          },
          apiKey: process.env.AIHUBMIX_API_KEY ?? null,
          maxTokens: toValidNumber(process.env.AIHUBMIX_MAX_TOKENS, 1024),
          ...config,
        });
      case "deepseek":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.deepseek.com/v1",
          },
          apiKey: process.env.DEEPSEEK_API_KEY ?? null,
          ...config,
        });
      case "gemini":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          },
          apiKey: process.env.GEMINI_API_KEY ?? null,
          ...config,
        });
      case "moonshotai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.moonshot.ai/v1",
          },
          apiKey: process.env.MOONSHOT_AI_API_KEY ?? null,
          ...config,
        });
      // OSS Model Runners
      // case "anythingllm_ollama":
      //   return new ChatOllama({
      //     baseUrl: process.env.PLACEHOLDER,
      //     ...config,
      //   });
      case "ollama":
        return new ChatOllama({
          baseUrl: process.env.OLLAMA_BASE_PATH,
          ...config,
        });
      case "lmstudio":
        return new ChatOpenAI({
          configuration: {
            baseURL: parseLMStudioBasePath(process.env.LMSTUDIO_BASE_PATH),
          },
          apiKey: "not-used", // Needs to be specified or else will assume OpenAI
          ...config,
        });
      default:
        throw new Error(`Unsupported provider ${provider} for this task.`);
    }
  }

  /**
   * Get the context limit for a provider/model combination using static method in AIProvider class.
   * @param {string} provider
   * @param {string} modelName
   * @returns {number}
   */
  static contextLimit(provider = "openai", modelName) {
    const llm = getLLMProviderClass({ provider });
    if (!llm || !llm.hasOwnProperty("promptWindowLimit")) return 8_000;
    return llm.promptWindowLimit(modelName);
  }

  static defaultSystemPromptForProvider(provider = null) {
    switch (provider) {
      case "lmstudio":
        return "You are a helpful ai assistant who can assist the user and use tools available to help answer the users prompts and questions. Tools will be handled by another assistant and you will simply receive their responses to help answer the user prompt - always try to answer the user's prompt the best you can with the context available to you and your general knowledge.";
      default:
        return DEFAULT_WORKSPACE_PROMPT;
    }
  }

  /**
   * Get the system prompt for a provider with CoT enhancement.
   * @param {string} provider
   * @param {import("@prisma/client").workspaces | null} workspace
   * @param {import("@prisma/client").users | null} user
   * @param {Object} options - 可选配置
   * @param {string} options.cotMode - CoT 模式 (standard/detailed/disabled)
   * @param {string[]} options.availableTools - 可用工具列表
   * @param {string[]} options.availableFlows - 可用 Flow 列表
   * @param {string|null} options.assistantSystemPrompt - AI 员工的专属提示词（优先级最高）
   * @returns {Promise<string>}
   */
  static async systemPrompt({
    provider = null,
    workspace = null,
    user = null,
    cotMode = COT_MODES.STANDARD,
    availableTools = [],
    availableFlows = [],
    assistantSystemPrompt = null,
  }) {
    // 获取基础提示词（优先级：AI员工提示词 > Workspace提示词 > Provider默认提示词）
    let basePrompt;
    if (assistantSystemPrompt) {
      // 优先使用 AI 员工的专属提示词
      basePrompt = assistantSystemPrompt;
      console.log(
        `[Agent] Using assistant system prompt (length: ${basePrompt.length})`
      );
    } else if (!workspace?.openAiPrompt) {
      basePrompt = Provider.defaultSystemPromptForProvider(provider);
    } else {
      basePrompt = await SystemPromptVariables.expandSystemPromptVariables(
        workspace.openAiPrompt,
        user?.id || null,
        workspace.id
      );
    }

    // 应用 CoT 增强
    return enhanceSystemPrompt(basePrompt, cotMode, {
      availableTools,
      availableFlows,
    });
  }

  /**
   * Whether the provider supports agent streaming.
   * Disabled by default and needs to be explicitly enabled in the provider
   * This is temporary while we migrate all providers to support agent streaming
   * @returns {boolean}
   */
  get supportsAgentStreaming() {
    return false;
  }

  /**
   * Stream a chat completion from the LLM with tool calling
   * Note: This using the OpenAI API format and may need to be adapted for other providers.
   *
   * @param {any[]} messages - The messages to send to the LLM.
   * @param {any[]} functions - The functions to use in the LLM.
   * @param {function} eventHandler - The event handler to use to report stream events.
   * @returns {Promise<{ functionCall: any, textResponse: string }>} - The result of the chat completion.
   */
  async stream(messages, functions = [], eventHandler = null) {
    this.providerLog("Provider.stream - will process this chat completion.");
    const msgUUID = v4();
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
      ...(Array.isArray(functions) && functions?.length > 0
        ? { functions }
        : {}),
    });

    const result = {
      functionCall: null,
      textResponse: "",
    };

    for await (const chunk of stream) {
      if (!chunk?.choices?.[0]) continue; // Skip if no choices
      const choice = chunk.choices[0];

      if (choice.delta?.content) {
        result.textResponse += choice.delta.content;
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: msgUUID,
          content: choice.delta.content,
        });
      }

      if (choice.delta?.function_call) {
        // accumulate the function call
        if (result.functionCall)
          result.functionCall.arguments += choice.delta.function_call.arguments;
        else result.functionCall = choice.delta.function_call;

        eventHandler?.("reportStreamEvent", {
          uuid: `${msgUUID}:tool_call_invocation`,
          type: "toolCallInvocation",
          content: `Assembling Tool Call: ${result.functionCall.name}(${result.functionCall.arguments})`,
        });
      }
    }

    // If there are arguments, parse them as json so that the tools can use them
    if (result.functionCall?.arguments)
      result.functionCall.arguments = safeJsonParse(
        result.functionCall.arguments,
        {}
      );

    return {
      textResponse: result.textResponse,
      functionCall: result.functionCall,
    };
  }
}

module.exports = Provider;
