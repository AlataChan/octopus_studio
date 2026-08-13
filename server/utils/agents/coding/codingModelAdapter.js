const PROVIDER_CAPABILITIES = Object.freeze({
  fake: { toolCalling: "native", dialect: "octopus-test" },
  deepseek: { toolCalling: "native", dialect: "openai-compatible" },
});

function providerKey(provider) {
  return String(provider || "fake").trim().toLowerCase();
}

function stopReasonFromFinishReason(finishReason) {
  if (finishReason === "tool_calls") return "tool_use";
  if (finishReason === "stop") return "end_turn";
  return finishReason || "end_turn";
}

function mergeToolCall(accumulator, deltaToolCall = {}) {
  const index = Number.isInteger(deltaToolCall.index) ? deltaToolCall.index : 0;
  const current =
    accumulator.get(index) ||
    { index, id: null, type: "function", name: "", arguments: "" };
  if (deltaToolCall.id) current.id = deltaToolCall.id;
  if (deltaToolCall.type) current.type = deltaToolCall.type;
  if (deltaToolCall.function?.name) current.name = deltaToolCall.function.name;
  if (deltaToolCall.function?.arguments) {
    current.arguments += deltaToolCall.function.arguments;
  }
  accumulator.set(index, current);
}

function parseToolInput(toolCall) {
  if (!toolCall.arguments) return {};
  try {
    return JSON.parse(toolCall.arguments);
  } catch (error) {
    throw new Error(
      `Invalid tool call arguments for ${toolCall.name || toolCall.id}: ${
        error?.message || String(error)
      }`
    );
  }
}

class CodingModelAdapter {
  constructor({ model, provider = "fake" } = {}) {
    if (!model || typeof model.stream !== "function") {
      throw new Error("CodingModelAdapter requires a model with stream()");
    }
    this.model = model;
    this.provider = providerKey(provider);
  }

  assertProviderSupported() {
    const capability = PROVIDER_CAPABILITIES[this.provider];
    if (capability?.toolCalling === "native") return;
    throw new Error(
      `Provider "${this.provider}" is not enabled for coding-agent tool calls`
    );
  }

  async *streamOpenAiCompatible(params = {}) {
    const pendingToolCalls = new Map();

    for await (const chunk of this.model.stream(params)) {
      if (!chunk) continue;
      const choices = Array.isArray(chunk.choices) ? chunk.choices : [];

      if (chunk.usage) yield { type: "usage", usage: chunk.usage };

      for (const choice of choices) {
        const delta = choice.delta || {};
        if (delta.content) yield { type: "text", text: delta.content };
        if (delta.reasoning_content || delta.reasoning) {
          yield {
            type: "thinking",
            text: delta.reasoning_content || delta.reasoning,
          };
        }
        for (const toolCall of delta.tool_calls || []) {
          mergeToolCall(pendingToolCalls, toolCall);
        }

        if (choice.finish_reason) {
          if (choice.finish_reason === "tool_calls") {
            for (const toolCall of Array.from(pendingToolCalls.values()).sort(
              (left, right) => left.index - right.index
            )) {
              yield {
                type: "tool_use",
                id: toolCall.id,
                name: toolCall.name,
                input: parseToolInput(toolCall),
              };
            }
            pendingToolCalls.clear();
          }
          yield {
            type: "stop_reason",
            stop_reason: stopReasonFromFinishReason(choice.finish_reason),
            provider_finish_reason: choice.finish_reason,
          };
        }
      }
    }
  }

  async *stream(params = {}) {
    this.assertProviderSupported();
    if (this.provider === "deepseek") {
      yield* this.streamOpenAiCompatible(params);
      return;
    }

    for await (const event of this.model.stream(params)) {
      if (!event) continue;
      if (event.type === "stop_reason") {
        yield { type: "stop_reason", stop_reason: event.stop_reason };
        continue;
      }
      yield event;
    }
  }
}

module.exports = {
  CodingModelAdapter,
  PROVIDER_CAPABILITIES,
};
