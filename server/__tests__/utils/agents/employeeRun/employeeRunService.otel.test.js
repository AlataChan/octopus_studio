"use strict";

/**
 * EmployeeRunService — OTel span instrumentation tests (Cap5-T2)
 *
 * Verifies that run() emits an "employee.run" span with correct attrs.
 * Uses InMemorySpanExporter injected via resetForTests for zero real-export overhead.
 */

const EventEmitter = require("node:events");
const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-node");
const { resetForTests } = require("../../../../utils/observability/otel");

// ─────────────────────────────────────────────────────────────────────────────
// FakeAibitat — mirrors employeeRunService.test.js pattern
// ─────────────────────────────────────────────────────────────────────────────
class FakeAibitat extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.handlerProps = opts.handlerProps;
    this._orchestrator = null;
    this._knowledgeSources = [];
    this.agents = new Map();
    this.permissionConfig = null;
    this.startCalls = 0;
    this.aborted = false;
    this._script = null;
  }

  use(plugin) {
    plugin.setup(this);
    return this;
  }

  agent(name, def) {
    this.agents.set(name, def);
    return this;
  }

  setPermissionConfig(cfg) {
    this.permissionConfig = cfg;
    return this;
  }

  onAbort(l) { this.on("abort", l); return this; }
  onTerminate(l) { this.on("terminate", l); return this; }
  onMessage(l) { this.on("message", l); return this; }
  onError(l) { this.on("replyError", l); return this; }
  onInterrupt(l) { this.on("interrupt", l); return this; }

  terminate() { this.emit("terminate"); }
  abort() { this.aborted = true; this.emit("abort"); }

  async start(route) {
    this.startCalls++;
    this.lastRoute = route;
    if (this._script) await this._script(this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks (same as employeeRunService.test.js)
// ─────────────────────────────────────────────────────────────────────────────
jest.mock("../../../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    getById: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../../../../models/skillInstallations", () => ({
  SkillInstallations: {
    listForWorkspace: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../../../utils/agents/defaults", () => ({
  USER_AGENT: {
    name: "USER",
    getDefinition: jest.fn().mockResolvedValue({ functions: ["docSearch"] }),
  },
  WORKSPACE_AGENT: {
    name: "WORKSPACE",
    getDefinition: jest.fn().mockResolvedValue({ functions: ["docSearch"] }),
  },
}));

jest.mock("../../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

jest.mock("../../../../models/workspaceChats", () => ({
  WorkspaceChats: {
    new: jest.fn(),
    create: jest.fn(),
    updateChat: jest.fn(),
    markWorkspaceAsSeen: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Module under test
// ─────────────────────────────────────────────────────────────────────────────
const { EmployeeRunService } = require("../../../../utils/agents/employeeRun/index");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeWorkspace(overrides = {}) {
  return { id: 1, agentProvider: "openai", agentModel: "gpt-4o-mini", ...overrides };
}

function makeService(scriptFn) {
  let lastFake = null;
  const service = new EmployeeRunService({
    createAibitat: (opts) => {
      lastFake = new FakeAibitat(opts);
      if (scriptFn) lastFake._script = scriptFn;
      return lastFake;
    },
  });
  service._getLastFake = () => lastFake;
  return service;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTel lifecycle
// ─────────────────────────────────────────────────────────────────────────────
let exporter;

beforeEach(async () => {
  exporter = new InMemorySpanExporter();
  await resetForTests({ exporter });
});

afterEach(async () => {
  await resetForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: normal run emits employee.run span with correct attrs
// ─────────────────────────────────────────────────────────────────────────────
describe("OTel — employee.run span", () => {
  it("正常 run → InMemory 有 employee.run span, attrs runId/assistantId/parentRunId 正确, sources/artifacts/textLen 为数值, 无敏感原文", async () => {
    const svc = makeService(async (fake) => {
      fake.emit("message", { from: "WORKSPACE", to: "USER", content: "hello world" });
      fake.terminate();
    });

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "assistant-42",
      task: "do something",
      parentRunId: "parent-run-1",
    });

    expect(result.error).toBeNull();

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === "employee.run");
    expect(span).toBeDefined();

    const attrs = span.attributes;

    // runId matches result
    expect(attrs.runId).toBe(result.runId);
    // assistantId
    expect(attrs.assistantId).toBe("assistant-42");
    // parentRunId
    expect(attrs.parentRunId).toBe("parent-run-1");

    // exit attrs: numeric
    expect(typeof attrs.textLen).toBe("number");
    expect(typeof attrs.sources).toBe("number");
    expect(typeof attrs.artifacts).toBe("number");

    // no raw task/context text in attrs
    const attrValues = Object.values(attrs).map(String);
    expect(attrValues).not.toContain("do something");

    // no error on success
    expect(attrs.hasError).toBe(false);
    expect(attrs.suspended).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: approval_needed run → span attrs suspended=true, errorCode=approval_needed
  // ─────────────────────────────────────────────────────────────────────────
  it("approval_needed run → span attrs suspended=true, errorCode=approval_needed", async () => {
    const svc = makeService(async (fake) => {
      fake.socket.send("approvalSuspended", { confirmationId: "conf-999", toolName: "riskTool", riskLevel: "high" });
      fake.terminate();
    });

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "assistant-99",
      task: "risky task",
      approvalDelegate: { requestApproval: jest.fn().mockResolvedValue({ decision: "suspend", confirmationId: "conf-999" }) },
    });

    expect(result.error?.code).toBe("approval_needed");

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === "employee.run");
    expect(span).toBeDefined();

    const attrs = span.attributes;
    expect(attrs.suspended).toBe(true);
    expect(attrs.errorCode).toBe("approval_needed");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: no-op — resetForTests() without exporter → run returns normally, no throw
  // ─────────────────────────────────────────────────────────────────────────
  it("no-op — resetForTests() (无 exporter) → run 正常返回、不抛", async () => {
    // Tear down provider → revert to no-op
    await resetForTests();

    const svc = makeService(async (fake) => {
      fake.emit("message", { from: "WORKSPACE", to: "USER", content: "noop ok" });
      fake.terminate();
    });

    const result = await svc.run({
      workspace: makeWorkspace(),
      assistantId: "assistant-noop",
      task: "noop test",
    });

    expect(result.text).toBe("noop ok");
    expect(result.error).toBeNull();
  });
});
