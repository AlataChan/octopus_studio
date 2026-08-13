"use strict";
/**
 * TDD test: aibitat LLM provider calls are wrapped in OTel llm.<provider> spans.
 *
 * Verifies:
 *  1. A span named "llm.<provider>" is emitted for provider.complete calls.
 *  2. A span named "llm.<provider>" is emitted for provider.stream calls.
 *  3. Span attrs contain `provider`, `model`, `streaming` — but never raw content.
 *  4. No-op behaviour when no exporter is configured (resetForTests() with no args).
 */

const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-base");
const {
  withSpan,
  resetForTests,
} = require("../../../../utils/observability/otel");

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal fake provider object that mimics the aibitat provider interface. */
function makeProvider({ name = "openai", model = "gpt-4o", streaming = false } = {}) {
  const providerObj = {
    model,
    complete: jest.fn().mockResolvedValue({ result: "Hello", usage: { promptTokens: 10, completionTokens: 5 } }),
    stream: jest.fn().mockResolvedValue({ textResponse: "Hello stream" }),
  };
  // Mimic constructor name used in aibitat for the span name
  Object.defineProperty(providerObj, "constructor", {
    value: { name },
    writable: false,
  });
  return providerObj;
}

/**
 * Simulate the wrapping logic that aibitat does for a provider.complete call.
 * This mirrors what we add in index.js.
 */
async function callCompleteWithSpan(provider, messages) {
  return withSpan(
    "llm." + (provider?.constructor?.name || "unknown"),
    {
      provider: String(provider?.constructor?.name || ""),
      model: String(provider?.model || ""),
      streaming: false,
    },
    async () => provider.complete(messages)
  );
}

/**
 * Simulate the wrapping logic that aibitat does for a provider.stream call.
 */
async function callStreamWithSpan(provider, messages, functions, eventHandler) {
  return withSpan(
    "llm." + (provider?.constructor?.name || "unknown"),
    {
      provider: String(provider?.constructor?.name || ""),
      model: String(provider?.model || ""),
      streaming: true,
    },
    async () => provider.stream(messages, functions, eventHandler)
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("OTel LLM provider spans — aibitat integration", () => {
  let exporter;

  beforeEach(async () => {
    exporter = new InMemorySpanExporter();
    await resetForTests({ exporter });
  });

  afterEach(async () => {
    await resetForTests(); // tear down, return to no-op
  });

  // ── 1. provider.complete emits an llm.<provider> span ──────────────────────
  it("emits llm.<provider> span for provider.complete", async () => {
    const provider = makeProvider({ name: "openai", model: "gpt-4o" });
    const messages = [{ role: "user", content: "hi" }];

    await callCompleteWithSpan(provider, messages);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("llm.openai");
    expect(spans[0].attributes.provider).toBe("openai");
    expect(spans[0].attributes.model).toBe("gpt-4o");
    expect(spans[0].attributes.streaming).toBe(false);
  });

  // ── 2. provider.stream emits an llm.<provider> span with streaming=true ────
  it("emits llm.<provider> span for provider.stream with streaming=true", async () => {
    const provider = makeProvider({ name: "anthropic", model: "claude-3-5-sonnet" });

    await callStreamWithSpan(provider, [], [], () => {});

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("llm.anthropic");
    expect(spans[0].attributes.provider).toBe("anthropic");
    expect(spans[0].attributes.model).toBe("claude-3-5-sonnet");
    expect(spans[0].attributes.streaming).toBe(true);
  });

  // ── 3. No raw message content in span attributes ────────────────────────────
  it("does not include raw message content in span attributes", async () => {
    const provider = makeProvider({ name: "openai", model: "gpt-4o" });
    const sensitiveMessages = [
      { role: "user", content: "my password is s3cr3t!" },
    ];

    await callCompleteWithSpan(provider, sensitiveMessages);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const attrValues = Object.values(spans[0].attributes);
    // No attribute value should contain the raw sensitive content
    for (const val of attrValues) {
      if (typeof val === "string") {
        expect(val).not.toContain("s3cr3t");
        expect(val).not.toContain("password");
        expect(val).not.toContain("my password");
      }
    }
    // Similarly, attribute keys should be only the expected set
    const attrKeys = Object.keys(spans[0].attributes);
    expect(attrKeys).not.toContain("messages");
    expect(attrKeys).not.toContain("content");
    expect(attrKeys).not.toContain("prompt");
  });

  // ── 4. span duration is non-negative ────────────────────────────────────────
  it("records a non-negative duration", async () => {
    const provider = makeProvider({ name: "openai", model: "gpt-4o" });
    await callCompleteWithSpan(provider, []);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];
    // endTime and startTime are [seconds, nanoseconds] tuples in OTel JS
    const startNs = span.startTime[0] * 1e9 + span.startTime[1];
    const endNs = span.endTime[0] * 1e9 + span.endTime[1];
    expect(endNs - startNs).toBeGreaterThanOrEqual(0);
  });

  // ── 5. no-op when no exporter configured ────────────────────────────────────
  it("is a no-op (does not throw, returns result) when no exporter is configured", async () => {
    // Tear down the in-memory provider, returning to no-op
    await resetForTests();

    const provider = makeProvider({ name: "openai", model: "gpt-4o" });
    const messages = [{ role: "user", content: "hello" }];

    // Should not throw; result should pass through
    const result = await callCompleteWithSpan(provider, messages);
    expect(result).toEqual({
      result: "Hello",
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    // provider.complete was still called
    expect(provider.complete).toHaveBeenCalledWith(messages);
  });

  // ── 6. span is marked ERROR and rethrows when provider throws ────────────────
  it("marks span ERROR and rethrows when provider.complete throws", async () => {
    const provider = makeProvider({ name: "openai", model: "gpt-4o" });
    const error = new Error("Rate limit exceeded");
    provider.complete.mockRejectedValueOnce(error);

    await expect(callCompleteWithSpan(provider, [])).rejects.toThrow(
      "Rate limit exceeded"
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    // OTel SpanStatusCode.ERROR = 2
    expect(spans[0].status.code).toBe(2);
  });

  // ── 7. multiple sequential provider calls each get their own span ────────────
  it("emits one span per provider call", async () => {
    const provider = makeProvider({ name: "openai", model: "gpt-4o" });

    await callCompleteWithSpan(provider, []);
    await callStreamWithSpan(provider, [], [], () => {});

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].name).toBe("llm.openai");
    expect(spans[1].name).toBe("llm.openai");
    // First is complete (streaming=false), second is stream (streaming=true)
    expect(spans[0].attributes.streaming).toBe(false);
    expect(spans[1].attributes.streaming).toBe(true);
  });
});
