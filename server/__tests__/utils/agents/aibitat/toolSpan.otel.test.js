"use strict";
/**
 * toolSpan.otel.test.js
 *
 * Verifies that _executeToolWithResult emits a `tool.<name>` OTel span
 * with safe attrs (no raw args/result), and that the no-op path (no exporter)
 * works without throwing.
 */

const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-node");
const { resetForTests } = require("../../../../utils/observability/otel");

// ── Standard mocks required by aibitat ─────────────────────────────────────
jest.mock("../../../../utils/agents/aibitat/providers/index.js", () => ({}));
jest.mock("../../../../models/telemetry.js", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));
jest.mock("../../../../utils/agents/toolStats.js", () => ({
  toolStats: {
    startCall: jest.fn(() => "call-1"),
    endCall: jest.fn(),
  },
}));
jest.mock("../../../../models/invocationStep", () => ({
  InvocationStep: {
    StepTypes: { TOOL_CALL: "tool_call" },
    create: jest.fn(),
  },
}));
jest.mock("../../../../models/workflowPendingConfirmation", () => ({
  WorkflowPendingConfirmation: {},
}));
jest.mock("../../../../models/run", () => ({
  Run: {},
}));
jest.mock("../../../../utils/liveCanvas/runEventEmitter", () => ({
  runEventEmitter: { emitForSession: jest.fn() },
}));
jest.mock("../../../../utils/liveCanvas/types", () => ({
  SSE_EVENTS: {},
}));

const AIbitat = require("../../../../utils/agents/aibitat");

// ── Helper: build a minimal AIbitat instance with one registered tool ───────
function buildAgent({ toolName = "test-tool", toolHandler = jest.fn().mockResolvedValue("ok"), toolError = null } = {}) {
  const agent = new AIbitat({
    handlerProps: {
      log: jest.fn(),
      invocation: { id: "otel-test" },
    },
  });

  agent.introspect = jest.fn();
  agent.reportToolCall = jest.fn();
  agent.evaluateToolPermission = jest.fn(() => ({ decision: "allow", reason: "" }));

  // Stub timeout executor so we control success/failure
  if (toolError) {
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn().mockResolvedValue({
        success: false,
        error: toolError,
        timedOut: false,
        durationMs: 5,
      }),
    };
  } else {
    agent.toolTimeoutExecutor = {
      getTimeout: jest.fn(() => 1000),
      executeWithTimeout: jest.fn().mockResolvedValue({
        success: true,
        result: "tool-output",
        timedOut: false,
        durationMs: 5,
      }),
    };
  }

  agent.function({ name: toolName, handler: toolHandler });
  return agent;
}

// ── Helper: find a span by name in the exporter ────────────────────────────
function findSpan(exporter, spanName) {
  return exporter.getFinishedSpans().find((s) => s.name === spanName);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("tool.<name> OTel span — _executeToolWithResult", () => {
  let exporter;

  beforeEach(async () => {
    exporter = new InMemorySpanExporter();
    await resetForTests({ exporter });
    process.env.USE_TURN_STATE = "true";
  });

  afterEach(async () => {
    await resetForTests(); // tear down, return to no-op
    delete process.env.USE_TURN_STATE;
  });

  // ── Test 1: successful tool call emits span with correct attrs ─────────────
  test("emits tool.<name> span with toolName/argsLen/resultType attrs on success", async () => {
    const agent = buildAgent({ toolName: "my-tool" });

    await agent._executeToolWithResult(
      "my-tool",
      { query: "hello" },
      "tool-use-id-1",
      "agent",
      {},
      agent._currentTurnState || {},
      {}
    );

    const span = findSpan(exporter, "tool.my-tool");
    expect(span).toBeDefined();

    const attrs = span.attributes;
    expect(attrs.toolName).toBe("my-tool");
    expect(typeof attrs.argsLen).toBe("number");
    expect(attrs.argsLen).toBeGreaterThan(0);
    expect(attrs.resultType).toBe("success");
    expect(attrs.isError).toBe(false);

    // PII guard: no raw args/result content in span attributes
    const attrValues = Object.values(attrs);
    expect(attrValues).not.toContain("hello");
    expect(attrValues).not.toContain("tool-output");
    expect(attrValues).not.toContain('{"query":"hello"}');
  });

  // ── Test 2: failed tool call (inputError) emits span with isError=true ─────
  test("emits tool.<name> span with isError=true and resultType=inputError on failure", async () => {
    const agent = buildAgent({ toolName: "failing-tool", toolError: new Error("boom!") });

    await agent._executeToolWithResult(
      "failing-tool",
      "{}",
      "tool-use-id-2",
      "agent",
      {},
      agent._currentTurnState || {},
      {}
    );

    const span = findSpan(exporter, "tool.failing-tool");
    expect(span).toBeDefined();

    const attrs = span.attributes;
    expect(attrs.toolName).toBe("failing-tool");
    expect(attrs.isError).toBe(true);
    expect(attrs.resultType).toBe("inputError");

    // PII guard: error message not in attrs
    const attrValues = Object.values(attrs);
    expect(attrValues).not.toContain("boom!");
  });

  // ── Test 3: unknown tool → inputError span ─────────────────────────────────
  test("emits tool.<name> span with isError=true when tool is not found", async () => {
    const agent = buildAgent({ toolName: "real-tool" });

    await agent._executeToolWithResult(
      "nonexistent-tool",
      {},
      "tool-use-id-3",
      "agent",
      {},
      agent._currentTurnState || {},
      {}
    );

    const span = findSpan(exporter, "tool.nonexistent-tool");
    expect(span).toBeDefined();

    const attrs = span.attributes;
    expect(attrs.toolName).toBe("nonexistent-tool");
    expect(attrs.isError).toBe(true);
    expect(attrs.resultType).toBe("inputError");
  });

  // ── Test 4: no-op path — no exporter → tool executes normally, no throw ────
  test("no-op: without exporter tool executes normally and does not throw", async () => {
    // Tear down the in-memory exporter to return to no-op
    await resetForTests();

    const agent = buildAgent({ toolName: "noop-tool" });

    const result = await agent._executeToolWithResult(
      "noop-tool",
      {},
      "tool-use-id-4",
      "agent",
      {},
      agent._currentTurnState || {},
      {}
    );

    // Should succeed with no throws
    expect(result).toBeDefined();
    expect(result.type).toBe("success");
    // No spans captured (no exporter)
    expect(exporter.getFinishedSpans().length).toBe(0);
  });

  // ── Test 5: argsLen is correct for string args ─────────────────────────────
  test("argsLen reflects string arg length when args is a string", async () => {
    const agent = buildAgent({ toolName: "str-args-tool" });
    const argsString = '{"key":"value"}';

    await agent._executeToolWithResult(
      "str-args-tool",
      argsString,
      "tool-use-id-5",
      "agent",
      {},
      agent._currentTurnState || {},
      {}
    );

    const span = findSpan(exporter, "tool.str-args-tool");
    expect(span).toBeDefined();
    expect(span.attributes.argsLen).toBe(argsString.length);
  });
});
