"use strict";

/**
 * Cap2 Task 2 — AnthropicProvider reasoning 捕获测试
 *
 * 验证:
 * 1. thinking_delta → eventHandler("reasoning", {content}) 被调用
 * 2. textResponse 只含 text_delta 内容，不含 thinking
 * 3. signature_delta 不抛异常，不污染 textResponse
 * 4. text_delta 的 reportStreamEvent 仍正常触发
 * 5. provider 能力标志 supportsReasoningStream / reasoningKind
 */

// ── Mock @anthropic-ai/sdk BEFORE requiring the provider ──────────────────────
jest.mock("@anthropic-ai/sdk");
const Anthropic = require("@anthropic-ai/sdk");

const AnthropicProvider = require("../../../../../utils/agents/aibitat/providers/anthropic");

// ── Helper: build fake async-iterable stream ─────────────────────────────────
async function* makeStream(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// Fake chunks representing an extended-thinking response
function buildFakeChunks() {
  return [
    // thinking block start (optional, provider should handle gracefully)
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    },
    // thinking_delta ×2
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "想一想" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "再想" },
    },
    // signature_delta
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "abc" },
    },
    // text block start
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    },
    // text_delta
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "最终答复" },
    },
    // message_stop
    { type: "message_stop" },
  ];
}

// ── Test setup ────────────────────────────────────────────────────────────────
let provider;
let mockMessagesCreate;

beforeEach(() => {
  // Build a mock Anthropic instance whose messages.create returns our async iterable
  mockMessagesCreate = jest.fn();
  Anthropic.mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));

  provider = new AnthropicProvider({
    options: { apiKey: "test-key", maxRetries: 0 },
    model: "claude-3-7-sonnet-20250219",
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("AnthropicProvider — reasoning stream (Cap2 T2)", () => {
  describe("thinking_delta → eventHandler('reasoning', ...)", () => {
    test("eventHandler receives ('reasoning', {content:'想一想'}) for first thinking_delta", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      await provider.stream([{ role: "user", content: "hi" }], [], eventHandler);

      const reasoningCalls = eventHandler.mock.calls.filter(
        ([type]) => type === "reasoning"
      );
      expect(reasoningCalls.length).toBeGreaterThanOrEqual(2);
      expect(reasoningCalls[0]).toEqual(["reasoning", { content: "想一想" }]);
      expect(reasoningCalls[1]).toEqual(["reasoning", { content: "再想" }]);
    });

    test("thinking content does NOT appear in textResponse", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      const result = await provider.stream(
        [{ role: "user", content: "hi" }],
        [],
        eventHandler
      );

      expect(result.textResponse).toBe("最终答复");
      expect(result.textResponse).not.toContain("想一想");
      expect(result.textResponse).not.toContain("再想");
    });
  });

  describe("signature_delta safe-ignore", () => {
    test("signature_delta does not throw", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      await expect(
        provider.stream([{ role: "user", content: "hi" }], [], eventHandler)
      ).resolves.not.toThrow();
    });

    test("signature_delta does not pollute textResponse", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      const result = await provider.stream(
        [{ role: "user", content: "hi" }],
        [],
        eventHandler
      );

      expect(result.textResponse).toBe("最终答复");
      expect(result.textResponse).not.toContain("abc");
    });

    test("signature_delta is NOT emitted as 'reasoning' event", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      await provider.stream([{ role: "user", content: "hi" }], [], eventHandler);

      const reasoningCalls = eventHandler.mock.calls.filter(
        ([type]) => type === "reasoning"
      );
      // Only 2 reasoning calls — one per thinking_delta, none for signature_delta
      expect(reasoningCalls.length).toBe(2);
    });
  });

  describe("text_delta still triggers reportStreamEvent", () => {
    test("eventHandler receives reportStreamEvent/textResponseChunk for text_delta", async () => {
      mockMessagesCreate.mockResolvedValue(makeStream(buildFakeChunks()));
      const eventHandler = jest.fn();

      await provider.stream([{ role: "user", content: "hi" }], [], eventHandler);

      const streamEventCalls = eventHandler.mock.calls.filter(
        ([type, payload]) =>
          type === "reportStreamEvent" &&
          payload?.type === "textResponseChunk" &&
          payload?.content === "最终答复"
      );
      expect(streamEventCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("provider capability markers", () => {
    test("supportsReasoningStream is true", () => {
      expect(provider.supportsReasoningStream).toBe(true);
    });

    test("reasoningKind is 'raw'", () => {
      expect(provider.reasoningKind).toBe("raw");
    });
  });
});
