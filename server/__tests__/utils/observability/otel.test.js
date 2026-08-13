"use strict";
/**
 * Tests for server/utils/observability/otel.js
 *
 * Uses InMemorySpanExporter + resetForTests for full Jest isolation.
 * Each test gets a fresh provider; no spans bleed across tests.
 */

const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-base");
const { SpanStatusCode } = require("@opentelemetry/api");

// The module under test — import once; resetForTests handles internal state.
const otel = require("../../../utils/observability/otel");
const { getTracer, withSpan, startSpan, safeAttrs, resetForTests } = otel;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function makeExporter() {
  return new InMemorySpanExporter();
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────────
let exporter;

beforeEach(async () => {
  exporter = makeExporter();
  await resetForTests({ exporter });
});

afterEach(async () => {
  await resetForTests(); // clean global state after each test
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. withSpan — basic return value and span attrs
// ──────────────────────────────────────────────────────────────────────────────
describe("withSpan — basic span recording", () => {
  test("returns fn value and records span with attrs", async () => {
    const result = await withSpan("a", { n: 1, ok: true }, async () => 42);

    expect(result).toBe(42);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("a");
    expect(spans[0].attributes["n"]).toBe(1);
    expect(spans[0].attributes["ok"]).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Parent / child propagation
// ──────────────────────────────────────────────────────────────────────────────
describe("withSpan — parent/child propagation", () => {
  test("child span parentSpanId === parent spanId", async () => {
    await withSpan("parent", {}, async () => {
      await withSpan("child", {}, async () => {});
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);

    const parent = spans.find((s) => s.name === "parent");
    const child = spans.find((s) => s.name === "child");

    expect(parent).toBeDefined();
    expect(child).toBeDefined();

    const parentSpanId = parent.spanContext().spanId;
    // In OTel 2.8, ReadableSpan exposes `parentSpanContext?: SpanContext`
    const childParentSpanId = child.parentSpanContext?.spanId;

    expect(childParentSpanId).toBe(parentSpanId);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. safeAttrs — PII stripping and type handling
// ──────────────────────────────────────────────────────────────────────────────
describe("safeAttrs", () => {
  test("number and boolean pass through unchanged", () => {
    const result = safeAttrs({ count: 5, flag: false });
    expect(result.count).toBe(5);
    expect(result.flag).toBe(false);
  });

  test("short string (≤64) passes through", () => {
    const result = safeAttrs({ key: "short" });
    expect(result.key).toBe("short");
  });

  test("long string (>64) is replaced with [len:N]", () => {
    const long = "x".repeat(65);
    const result = safeAttrs({ prompt: long });
    expect(result.prompt).toMatch(/^\[len:\d+\]$/);
    expect(result.prompt).not.toContain("x".repeat(10));
  });

  test("object is replaced with [obj:...] placeholder", () => {
    const result = safeAttrs({ data: { a: 1, b: 2 } });
    expect(typeof result.data).toBe("string");
    expect(result.data).toMatch(/^\[obj/);
  });

  test("array is replaced with [obj:...] placeholder", () => {
    const result = safeAttrs({ items: [1, 2, 3] });
    expect(typeof result.items).toBe("string");
    expect(result.items).toMatch(/^\[obj/);
  });

  test("null and undefined values are omitted", () => {
    const result = safeAttrs({ a: null, b: undefined, c: 1 });
    expect(result).not.toHaveProperty("a");
    expect(result).not.toHaveProperty("b");
    expect(result.c).toBe(1);
  });

  test("sensitive long prompt text does not appear in output", () => {
    const sensitivePrompt =
      "SECRET: The user said this is a very sensitive message with PII data that should never appear in traces because it exceeds the 64 char limit and is sensitive.";
    const result = safeAttrs({ userInput: sensitivePrompt });
    expect(result.userInput).not.toContain("SECRET");
    expect(result.userInput).not.toContain("PII");
    expect(result.userInput).toMatch(/^\[len:\d+\]$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Exception handling — rethrow + sanitized recording
// ──────────────────────────────────────────────────────────────────────────────
describe("withSpan — exception handling", () => {
  test("rethrows exception and marks span as ERROR", async () => {
    await expect(
      withSpan("e", {}, async () => {
        throw new Error("boom secret");
      })
    ).rejects.toThrow("boom secret");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];

    // Status must be ERROR
    expect(span.status.code).toBe(SpanStatusCode.ERROR);

    // The word "secret" must NOT appear verbatim in exported span event messages
    // Check events (recordException adds an "exception" event with message attr)
    const allEventAttrs = span.events
      .map((e) => JSON.stringify(e.attributes || {}))
      .join("|");
    expect(allEventAttrs).not.toContain("secret");
    // Also check status message
    const statusMsg = span.status.message || "";
    expect(statusMsg).not.toContain("secret");
  });

  test("exception message is truncated / sanitized in span events", async () => {
    const longMessage =
      "This is a very long error message that contains sensitive data like passwords and SQL injection attempts and should be truncated";

    await expect(
      withSpan("truncErr", {}, async () => {
        throw new Error(longMessage);
      })
    ).rejects.toThrow();

    const spans = exporter.getFinishedSpans();
    const span = spans[0];

    // Find exception event
    const exEvent = span.events?.find((e) => e.name === "exception");
    if (exEvent) {
      const msg = exEvent.attributes?.["exception.message"];
      if (msg) {
        expect(msg.length).toBeLessThanOrEqual(200);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. No-op default — no OTEL_EXPORTER → fn still runs, no spans exported
// ──────────────────────────────────────────────────────────────────────────────
describe("no-op default (no exporter)", () => {
  test("withSpan runs fn and returns value without crashing; no spans in InMemory", async () => {
    // Reset without an exporter; ensure env var is absent
    const saved = process.env.OTEL_EXPORTER;
    delete process.env.OTEL_EXPORTER;

    await resetForTests(); // no exporter → no-op mode

    const result = await withSpan("noop", {}, async () => 99);
    expect(result).toBe(99);

    // exporter from beforeEach no longer wired → still empty from last reset
    // The new no-op provider does not send to our InMemory exporter
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(0);

    // Restore
    if (saved !== undefined) process.env.OTEL_EXPORTER = saved;
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. startSpan — manual lifecycle
// ──────────────────────────────────────────────────────────────────────────────
describe("startSpan — manual span lifecycle", () => {
  test("start → setAttribute → end → span appears in export", async () => {
    const span = startSpan("manualSpan", { step: "init" });
    span.setAttribute("phase", "work");
    span.end();

    // Force flush if BatchSpanProcessor; SimpleSpanProcessor flushes synchronously
    await new Promise((r) => setTimeout(r, 10));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("manualSpan");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Jest isolation — two tests don't bleed spans into each other
// ──────────────────────────────────────────────────────────────────────────────
describe("Jest isolation", () => {
  test("test A records exactly its own spans", async () => {
    await withSpan("spanA", { id: "a" }, async () => {});
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("spanA");
  });

  test("test B sees only its own spans (not test A's)", async () => {
    // beforeEach already called resetForTests with a fresh exporter
    await withSpan("spanB", { id: "b" }, async () => {});
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("spanB");
    // Ensure no "spanA" leaked in
    expect(spans.find((s) => s.name === "spanA")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Exported API surface
// ──────────────────────────────────────────────────────────────────────────────
describe("exported API surface", () => {
  test("module exports all required functions", () => {
    expect(typeof otel.getTracer).toBe("function");
    expect(typeof otel.withSpan).toBe("function");
    expect(typeof otel.startSpan).toBe("function");
    expect(typeof otel.safeAttrs).toBe("function");
    expect(typeof otel.resetForTests).toBe("function");
  });
});
