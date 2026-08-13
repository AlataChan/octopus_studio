/**
 * TDD: DeepSeek provider — reasoning_content → eventHandler("reasoning") 流式捕获
 *
 * Cap2 feature: When DeepSeek streams `delta.reasoning_content`, the provider must:
 *   1. Call eventHandler("reasoning", { content: <reasoning_content> })
 *   2. NOT include reasoning_content in the returned textResponse
 *   3. Still include normal delta.content in textResponse
 *
 * Uses OpenAI SDK (mocked). DeepSeek uses openai-compatible API.
 */

"use strict";

// ── Mock openai BEFORE requiring the provider ──────────────────────────────
// DeepSeek provider creates `new OpenAI(...)` internally; we replace the whole
// module so the SDK never touches the network.
jest.mock("openai");

const OpenAI = require("openai");

// ── Helper: build a fake async-iterable stream ────────────────────────────
function makeStream(chunks) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < chunks.length) {
            return { value: chunks[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

// ── Shared stream chunks fixture ──────────────────────────────────────────
// Simulates a deepseek-reasoner response with interleaved reasoning + content
const REASONING_CHUNK_1 = {
  choices: [
    {
      delta: {
        reasoning_content: "Let me think about this...",
        content: null,
      },
    },
  ],
};

const REASONING_CHUNK_2 = {
  choices: [
    {
      delta: {
        reasoning_content: " The answer is 42.",
        content: null,
      },
    },
  ],
};

const CONTENT_CHUNK_1 = {
  choices: [
    {
      delta: {
        reasoning_content: null,
        content: "The answer is ",
      },
    },
  ],
};

const CONTENT_CHUNK_2 = {
  choices: [
    {
      delta: {
        reasoning_content: null,
        content: "42.",
      },
    },
  ],
};

// ── Test suite ────────────────────────────────────────────────────────────

describe("DeepSeekProvider — reasoning_content streaming (Cap2)", () => {
  let DeepSeekProvider;
  let mockChatCompletionsCreate;

  beforeEach(() => {
    // Build a minimal mock for the OpenAI client constructor
    mockChatCompletionsCreate = jest.fn();

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    }));

    // Re-require provider fresh so it picks up the mock
    jest.resetModules();
    jest.mock("openai");
    const OpenAIMock = require("openai");
    OpenAIMock.mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    }));

    DeepSeekProvider = require("../../../../utils/agents/aibitat/providers/deepseek.js");
  });

  afterEach(() => {
    jest.resetModules();
  });

  // ── Capability markers ──────────────────────────────────────────────────

  test("supportsReasoningStream getter returns true", () => {
    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    expect(provider.supportsReasoningStream).toBe(true);
  });

  test("reasoningKind getter returns 'raw'", () => {
    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    expect(provider.reasoningKind).toBe("raw");
  });

  // ── Core streaming behaviour ────────────────────────────────────────────

  test("emits reasoning events for each reasoning_content delta", async () => {
    const fakeStream = makeStream([
      REASONING_CHUNK_1,
      REASONING_CHUNK_2,
      CONTENT_CHUNK_1,
      CONTENT_CHUNK_2,
    ]);
    mockChatCompletionsCreate.mockResolvedValue(fakeStream);

    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    const eventHandler = jest.fn();

    await provider.stream([], [], eventHandler);

    // Filter only "reasoning" events
    const reasoningCalls = eventHandler.mock.calls.filter(
      ([event]) => event === "reasoning"
    );

    expect(reasoningCalls).toHaveLength(2);
    expect(reasoningCalls[0][1]).toEqual({
      content: "Let me think about this...",
    });
    expect(reasoningCalls[1][1]).toEqual({ content: " The answer is 42." });
  });

  test("textResponse contains ONLY content deltas, NOT reasoning_content", async () => {
    const fakeStream = makeStream([
      REASONING_CHUNK_1,
      REASONING_CHUNK_2,
      CONTENT_CHUNK_1,
      CONTENT_CHUNK_2,
    ]);
    mockChatCompletionsCreate.mockResolvedValue(fakeStream);

    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    const result = await provider.stream([], [], jest.fn());

    expect(result.textResponse).toBe("The answer is 42.");
    // Reasoning text must NOT appear in textResponse
    expect(result.textResponse).not.toContain("Let me think about this...");
    expect(result.textResponse).not.toContain("Let me think");
  });

  test("does not emit reasoning events when reasoning_content is absent", async () => {
    const fakeStream = makeStream([CONTENT_CHUNK_1, CONTENT_CHUNK_2]);
    mockChatCompletionsCreate.mockResolvedValue(fakeStream);

    const provider = new DeepSeekProvider({ model: "deepseek-chat" });
    const eventHandler = jest.fn();

    await provider.stream([], [], eventHandler);

    const reasoningCalls = eventHandler.mock.calls.filter(
      ([event]) => event === "reasoning"
    );
    expect(reasoningCalls).toHaveLength(0);
  });

  test("handles stream with ONLY reasoning chunks (no content) without error", async () => {
    mockChatCompletionsCreate.mockResolvedValue(
      makeStream([REASONING_CHUNK_1, REASONING_CHUNK_2])
    );

    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    const eventHandler = jest.fn();

    const result = await provider.stream([], [], eventHandler);

    expect(result).toBeDefined();
    expect(result.textResponse).toBe("");

    const reasoningCalls = eventHandler.mock.calls.filter(
      ([event]) => event === "reasoning"
    );
    expect(reasoningCalls).toHaveLength(2);
  });

  test("works correctly when eventHandler is null (no crash)", async () => {
    const fakeStream = makeStream([REASONING_CHUNK_1, CONTENT_CHUNK_1]);
    mockChatCompletionsCreate.mockResolvedValue(fakeStream);

    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });

    await expect(provider.stream([], [], null)).resolves.toBeDefined();
  });

  test("functionCall is null when stream has no tool_calls", async () => {
    const fakeStream = makeStream([CONTENT_CHUNK_1, CONTENT_CHUNK_2]);
    mockChatCompletionsCreate.mockResolvedValue(fakeStream);

    const provider = new DeepSeekProvider({ model: "deepseek-reasoner" });
    const result = await provider.stream([], [], jest.fn());

    expect(result.functionCall).toBeNull();
  });
});
