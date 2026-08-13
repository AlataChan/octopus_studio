const { getBaseLLMProviderModel } = require("../helpers");
const {
  createDeterministicWorkAgentModel,
} = require("./deterministicModel");
const {
  WORK_AGENT_SETTINGS,
  getWorkAgentSetting,
} = require("./settings");
const {
  pricingFor,
} = require("../AiProviders/providerRouter/pricing");

function normalizeProvider(provider) {
  if (!provider) return null;
  if (provider === "phase1-deterministic") return "deterministic";
  return provider;
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stableJsonStringify(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function contentParts(content) {
  if (Array.isArray(content)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return [];
}

function toolCallPartToOpenAI(part) {
  const toolCallId = part.toolCallId || part.tool_call_id || part.id;
  const toolName = part.toolName || part.tool_name || part.name;
  if (!toolCallId || !toolName) return null;
  return {
    id: toolCallId,
    type: "function",
    function: {
      name: toolName,
      arguments: stableJsonStringify(part.input ?? part.args ?? {}, "{}"),
    },
  };
}

function toolResultPartToOpenAI(part) {
  const toolCallId = part.toolCallId || part.tool_call_id || part.id;
  if (!toolCallId) return null;
  const result = Object.prototype.hasOwnProperty.call(part, "result")
    ? part.result
    : part.output;
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: stableJsonStringify(result, ""),
  };
}

function promptToOpenAIMessages(prompt = []) {
  return prompt.flatMap((message) => {
    const role = message.role === "tool" ? "tool" : message.role || "user";
    const parts = contentParts(message.content);

    if (role === "tool") {
      const toolResults = parts
        .filter((part) => part?.type === "tool-result")
        .map(toolResultPartToOpenAI)
        .filter(Boolean);
      if (toolResults.length) return toolResults;
      return [
        {
          role: "tool",
          content: contentToText(message.content),
          ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
        },
      ];
    }

    const openAiMessage = {
      role,
      content: contentToText(message.content),
    };

    if (role === "assistant") {
      const toolCalls = parts
        .filter((part) => part?.type === "tool-call")
        .map(toolCallPartToOpenAI)
        .filter(Boolean);
      if (toolCalls.length) openAiMessage.tool_calls = toolCalls;
    }

    return [openAiMessage];
  });
}

function toOpenAITools(tools = []) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name || tool.toolName,
      description: tool.description || "",
      parameters: tool.parameters || {
        type: "object",
        additionalProperties: true,
      },
    },
  }));
}

function toOpenAIResponseFormat(responseFormat) {
  if (responseFormat?.type !== "json") return null;
  if (!responseFormat.schema) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: responseFormat.name || "structured_output",
      schema: responseFormat.schema,
    },
  };
}

function createOpenAICompatibleLanguageModel({ apiKey, model, baseURL = null }) {
  return {
    specificationVersion: "v2",
    provider: "openai",
    modelId: model,
    supportedUrls: {},
    doGenerate: async ({
      prompt = [],
      tools = [],
      temperature = 0.2,
      responseFormat,
    } = {}) => {
      const { OpenAI } = require("openai");
      const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
      const openAiTools = toOpenAITools(tools);
      const openAiResponseFormat = toOpenAIResponseFormat(responseFormat);
      const response = await client.chat.completions.create({
        model,
        messages: promptToOpenAIMessages(prompt),
        temperature,
        ...(openAiTools.length ? { tools: openAiTools, tool_choice: "auto" } : {}),
        ...(openAiResponseFormat
          ? { response_format: openAiResponseFormat }
          : {}),
      });

      const message = response.choices?.[0]?.message || {};
      const content = [];
      for (const toolCall of message.tool_calls || []) {
        content.push({
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.function?.name,
          input: toolCall.function?.arguments || "{}",
        });
      }
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }

      return {
        rawCall: { rawPrompt: prompt, rawSettings: { model } },
        finishReason: message.tool_calls?.length ? "tool-calls" : "stop",
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        content,
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("Work-agent OpenAI route uses generate() for Phase 2.");
    },
  };
}

function buildDeterministicRoute({ strategy = "offline-fallback", toolPlan = [] } = {}) {
  return {
    provider: "deterministic",
    model: "work-agent-deterministic",
    strategy,
    costClass: "local-test",
    pricing: pricingFor("deterministic", "work-agent-deterministic"),
    languageModel: createDeterministicWorkAgentModel({ toolPlan }),
    deterministic: true,
  };
}

async function buildProviderRoute(_authCtx = {}) {
  const requestedProvider = normalizeProvider(
    (await getWorkAgentSetting(WORK_AGENT_SETTINGS.provider)) ||
      process.env.LLM_PROVIDER
  );

  if (requestedProvider === "deterministic") {
    return buildDeterministicRoute({ strategy: "explicit-test" });
  }

  if (requestedProvider === "openai" && process.env.OPEN_AI_KEY) {
    const model =
      getBaseLLMProviderModel({ provider: "openai" }) ||
      process.env.OPEN_MODEL_PREF ||
      "gpt-4o-mini";
    return {
      provider: "openai",
      model,
      strategy: "provider-default",
      costClass: "default",
      pricing: pricingFor("openai", model),
      languageModel: createOpenAICompatibleLanguageModel({
        apiKey: process.env.OPEN_AI_KEY,
        model,
      }),
    };
  }

  if (
    requestedProvider === "generic-openai" &&
    process.env.GENERIC_OPEN_AI_BASE_PATH
  ) {
    const model = process.env.GENERIC_OPEN_AI_MODEL_PREF || "gpt-4o-mini";
    return {
      provider: "generic-openai",
      model,
      strategy: "provider-default",
      costClass: "default",
      pricing: pricingFor("generic-openai", model),
      languageModel: createOpenAICompatibleLanguageModel({
        apiKey: process.env.GENERIC_OPEN_AI_API_KEY || "no-key-required",
        model,
        baseURL: process.env.GENERIC_OPEN_AI_BASE_PATH,
      }),
    };
  }

  return buildDeterministicRoute();
}

function estimateCost({ pricing = {}, inputTokens = 0, outputTokens = 0 }) {
  if (
    pricing.inputUsdPer1M == null ||
    pricing.outputUsdPer1M == null ||
    inputTokens == null ||
    outputTokens == null
  ) {
    return null;
  }
  return (
    (Number(inputTokens) / 1_000_000) * pricing.inputUsdPer1M +
    (Number(outputTokens) / 1_000_000) * pricing.outputUsdPer1M
  );
}

module.exports = {
  buildProviderRoute,
  buildDeterministicRoute,
  createOpenAICompatibleLanguageModel,
  estimateCost,
};
