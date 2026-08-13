"use strict";

/**
 * Cap5 · Task 5 — End-to-end span-nesting acceptance test
 *
 * Proves OTel context propagates across the REAL call chain:
 *   TeamOrchestrationService → buildRunEmployeeMastraTool
 *     → createRunEmployeeTool → EmployeeRunService
 *
 * Bottom: FakeAibitat (same pattern as employeeRunService.test.js)
 *
 * Fakes:
 *   - createPlan (returns fixed 1-2 step plan, no LLM call)
 *   - runStore   (in-memory, no DB)
 *   - generateText (jest.fn, not called since createPlan is faked)
 *   - createAibitat (returns FakeAibitat — no real LLM engine)
 *   - loadMastra (fake createTool/z — avoids Mastra ESM incompatibility in Jest)
 *     Note: createTool is replaced with (config) => config so tool.execute is config.execute
 *
 * Real (NOT mocked):
 *   - buildRunEmployeeMastraTool (real function, injected with fake loadMastra + real createRunEmployeeTool)
 *   - createRunEmployeeTool (real function)
 *   - EmployeeRunService (real class, injected with FakeAibitat + MockAgentRuntimeFactory)
 *
 * The real call chain for each step:
 *   TeamOrchestrationService.run()
 *     → withSpan("team.orchestration")
 *       → withSpan("team.step")
 *         → tool.execute()          [buildRunEmployeeMastraTool's config.execute]
 *           → callable.invoke()     [createRunEmployeeTool's invoke]
 *             → service.run()       [EmployeeRunService.run]
 *               → withSpan("employee.run")
 *
 * Context propagation: OTel AsyncLocalStorageContextManager propagates across
 * await chains. All layers are synchronous-await, so employee.run should nest
 * under team.step (perfect nesting). If context is lost, the test records the
 * actual nesting result and documents the finding.
 *
 * See docs/OBSERVABILITY.md for span vocabulary and known refinements.
 */

const EventEmitter = require("node:events");
const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-node");
const { resetForTests } = require("../../../../utils/observability/otel");

// ─────────────────────────────────────────────────────────────────────────────
// FakeAibitat — mirrors employeeRunService.test.js pattern
// Fakes LLM engine only; httpSocket plugin runs real setup(this).
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

  use(plugin) { plugin.setup(this); return this; }
  agent(name, def) { this.agents.set(name, def); return this; }
  setPermissionConfig(cfg) { this.permissionConfig = cfg; return this; }
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
// Mocks for EmployeeRunService external deps (prevent DB/network calls)
// ─────────────────────────────────────────────────────────────────────────────
jest.mock("../../../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: { getById: jest.fn().mockResolvedValue(null) },
}));

jest.mock("../../../../models/skillInstallations", () => ({
  SkillInstallations: { listForWorkspace: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../../../utils/agents/defaults", () => ({
  USER_AGENT: {
    name: "USER",
    getDefinition: jest.fn().mockResolvedValue({ functions: [] }),
  },
  WORKSPACE_AGENT: {
    name: "WORKSPACE",
    getDefinition: jest.fn().mockResolvedValue({ functions: [] }),
  },
}));

jest.mock("../../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

jest.mock("../../../../models/workspaceChats", () => ({
  WorkspaceChats: {
    new: jest.fn(), create: jest.fn(),
    updateChat: jest.fn(), markWorkspaceAsSeen: jest.fn(),
  },
}));

// Mock approvalBroker to prevent its default store from needing DB
jest.mock("../../../../utils/agents/orchestration/approvalBroker", () => ({
  createApprovalBroker: jest.fn().mockReturnValue({}),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Real middle-layer imports (NOT mocked — these form the real chain)
// ─────────────────────────────────────────────────────────────────────────────
const { TeamOrchestrationService } = require(
  "../../../../utils/agents/orchestration/teamOrchestrationService"
);
const { buildRunEmployeeMastraTool } = require(
  "../../../../utils/agents/orchestration/runEmployeeMastraTool"
);
const { createRunEmployeeTool } = require(
  "../../../../utils/agents/employeeRun/runEmployeeTool"
);
const { EmployeeRunService } = require(
  "../../../../utils/agents/employeeRun/index"
);

// ─────────────────────────────────────────────────────────────────────────────
// Fake loadMastra — avoids Mastra ESM (p-map) incompatibility in Jest CJS mode
// createTool: (config) => config  →  tool.execute === config.execute (works the same)
// z: minimal schema stub (not validated in tests)
// ─────────────────────────────────────────────────────────────────────────────
function fakeLoadMastra() {
  return {
    createTool: (config) => config,  // tool.execute = config.execute directly
    z: {
      object: () => ({}),
      string: () => ({ optional: () => ({}) }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory runStore (no DB)
// ─────────────────────────────────────────────────────────────────────────────
function makeRunStore() {
  const store = {};
  let _id = 0;
  return {
    async create({ workspaceId, threadId, goal, plan, parentRunId }) {
      const id = `e2e_run_${++_id}`;
      store[id] = { workspaceId, threadId, goal, plan, cursor: 0, status: "running", parentRunId };
      return id;
    },
    async update(runId, patch) { store[runId] = { ...(store[runId] || {}), ...patch }; },
    async finalize(runId, status) { if (store[runId]) store[runId].finalStatus = status; },
    async get(runId) { return store[runId] || {}; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MockAgentRuntimeFactory — avoids DB calls from AgentRuntimeFactory.assemble
// ─────────────────────────────────────────────────────────────────────────────
const MockAgentRuntimeFactory = {
  resolveProviderModel() { return { provider: "openai", model: "gpt-4o-mini" }; },
  async assemble() {
    return {
      permissionConfig: { permissionMode: "default", allowedTools: [], autoApprovedTools: [] },
      userAgentDef: { functions: [] },
      workspaceAgentDef: { functions: [] },
      funcsToLoad: [],
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Build a real EmployeeRunService with FakeAibitat injected
// ─────────────────────────────────────────────────────────────────────────────
function makeEmployeeRunService(scriptFn) {
  let lastFake = null;
  const service = new EmployeeRunService({
    createAibitat: (opts) => {
      const fake = new FakeAibitat(opts);
      fake._script = scriptFn;
      lastFake = fake;
      return fake;
    },
    AgentRuntimeFactory: MockAgentRuntimeFactory,
    attachAgentPlugins: jest.fn().mockResolvedValue(undefined),
  });
  return { service, getLastFake: () => lastFake };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build real buildRunEmployeeMastraTool with:
//   - fake loadMastra (avoids ESM)
//   - real createRunEmployeeTool
//   - real EmployeeRunService (service param)
// ─────────────────────────────────────────────────────────────────────────────
function makeRealTool(ctx) {
  return buildRunEmployeeMastraTool({
    ...ctx,
    loadMastra: fakeLoadMastra,
    createRunEmployeeTool,  // real function
    // service is passed via ctx
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OTel isolation
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
// E2E TEST 1: span hierarchy  team.orchestration → team.step → employee.run
// ─────────────────────────────────────────────────────────────────────────────
test(
  "e2e: team.orchestration → team.step → employee.run span nesting (context propagation across real chain)",
  async () => {
    const fakeScript = async (fake) => {
      fake.emit("message", { from: "WORKSPACE", to: "USER", content: "subtask done" });
      fake.terminate();
    };

    const { service } = makeEmployeeRunService(fakeScript);
    const workspace = { id: 99, agentProvider: "openai", agentModel: "gpt-4o-mini" };

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue({
        steps: [{ assistantId: "worker-1", subtask: "do the thing" }],
        reason: "ok",
        error: null,
      }),
      buildRunEmployeeMastraTool: (ctx) => makeRealTool({ ...ctx, service }),
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
    });

    const result = await svc.run({
      workspace,
      goal: "e2e trace test",
      employees: [{ assistantId: "worker-1", name: "Worker" }],
      generateText: jest.fn(),
    });

    expect(result.status).toBe("done");

    const spans = exporter.getFinishedSpans();

    // ── Verify all three span types exist ─────────────────────────────────
    const orchestrationSpan = spans.find((s) => s.name === "team.orchestration");
    const stepSpan = spans.find((s) => s.name === "team.step");
    const employeeSpan = spans.find((s) => s.name === "employee.run");

    expect(orchestrationSpan).toBeDefined();
    expect(stepSpan).toBeDefined();
    expect(employeeSpan).toBeDefined();

    // ── Attrs sanity ──────────────────────────────────────────────────────
    expect(orchestrationSpan.attributes.status).toBe("done");
    expect(orchestrationSpan.attributes.steps).toBe(1);
    expect(stepSpan.attributes.stepId).toBe(0);
    expect(stepSpan.attributes.assistantId).toBe("worker-1");
    expect(employeeSpan.attributes.assistantId).toBe("worker-1");

    // ── team.step is child of team.orchestration ───────────────────────────
    const orchSpanId = orchestrationSpan.spanContext().spanId;
    const stepSpanId = stepSpan.spanContext().spanId;

    expect(stepSpan.parentSpanContext).toBeDefined();
    expect(stepSpan.parentSpanContext.spanId).toBe(orchSpanId);

    // ── employee.run context propagation result ───────────────────────────
    // OTel AsyncLocalStorageContextManager propagates context across all await
    // boundaries in the real chain, so employee.run nests directly under team.step.
    const employeeParentSpanId = employeeSpan.parentSpanContext?.spanId;
    const nestedUnderStep = employeeParentSpanId === stepSpanId;
    const nestedUnderOrch = employeeParentSpanId === orchSpanId;

    // Golden assertion: employee.run MUST be a direct child of team.step.
    // Context propagates correctly across:
    //   withSpan("team.step") → tool.execute() → callable.invoke() → service.run()
    //     → withSpan("employee.run")
    // If this fails, AsyncLocalStorage context was lost (regression).
    expect(nestedUnderStep).toBe(true);
    // Sanity: not accidentally under orchestration span
    expect(nestedUnderOrch).toBe(false);
  },
  15000
);

// ─────────────────────────────────────────────────────────────────────────────
// E2E TEST 2: two-step plan → 1 orchestration, 2 step, 2 employee spans
// ─────────────────────────────────────────────────────────────────────────────
test(
  "e2e: 2-step plan produces 1 team.orchestration, 2 team.step, 2 employee.run spans",
  async () => {
    const fakeScript = async (fake) => {
      fake.emit("message", { from: "WORKSPACE", to: "USER", content: "step done" });
      fake.terminate();
    };

    const { service } = makeEmployeeRunService(fakeScript);
    const workspace = { id: 88, agentProvider: "openai", agentModel: "gpt-4o-mini" };

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue({
        steps: [
          { assistantId: "analyst", subtask: "analyze" },
          { assistantId: "reporter", subtask: "report" },
        ],
        reason: "ok",
        error: null,
      }),
      buildRunEmployeeMastraTool: (ctx) => makeRealTool({ ...ctx, service }),
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
    });

    const result = await svc.run({
      workspace,
      goal: "two-step e2e",
      employees: [
        { assistantId: "analyst", name: "Analyst" },
        { assistantId: "reporter", name: "Reporter" },
      ],
      generateText: jest.fn(),
    });

    expect(result.status).toBe("done");

    const spans = exporter.getFinishedSpans();

    const orchestrationSpans = spans.filter((s) => s.name === "team.orchestration");
    const stepSpans = spans.filter((s) => s.name === "team.step");
    const employeeSpans = spans.filter((s) => s.name === "employee.run");

    expect(orchestrationSpans).toHaveLength(1);
    expect(stepSpans).toHaveLength(2);
    expect(employeeSpans).toHaveLength(2);

    // Both step spans are children of orchestration
    const orchSpanId = orchestrationSpans[0].spanContext().spanId;
    for (const ss of stepSpans) {
      expect(ss.parentSpanContext.spanId).toBe(orchSpanId);
    }

    // Both employee spans have a parent (context propagated)
    for (const es of employeeSpans) {
      expect(es.parentSpanContext?.spanId).toBeTruthy();
    }

    // assistantId attrs on employee spans match expected employees
    const empAssistantIds = employeeSpans.map((s) => s.attributes.assistantId).sort();
    expect(empAssistantIds).toEqual(["analyst", "reporter"]);
  },
  20000
);

// ─────────────────────────────────────────────────────────────────────────────
// E2E TEST 3: orchestrationRunId attr + employee.run parentRunId linkage
// ─────────────────────────────────────────────────────────────────────────────
test(
  "e2e: orchestrationRunId on team.orchestration span; employee.run parentRunId matches",
  async () => {
    const fakeScript = async (fake) => { fake.terminate(); };
    const { service } = makeEmployeeRunService(fakeScript);
    const workspace = { id: 77, agentProvider: "openai", agentModel: "gpt-4o-mini" };

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue({
        steps: [{ assistantId: "a1", subtask: "task" }],
        reason: "ok",
        error: null,
      }),
      buildRunEmployeeMastraTool: (ctx) => makeRealTool({ ...ctx, service }),
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
    });

    await svc.run({
      workspace,
      goal: "attr test",
      employees: [{ assistantId: "a1", name: "A1" }],
      generateText: jest.fn(),
    });

    const spans = exporter.getFinishedSpans();

    const orchSpan = spans.find((s) => s.name === "team.orchestration");
    expect(orchSpan).toBeDefined();
    const orchRunId = orchSpan.attributes.orchestrationRunId;
    expect(typeof orchRunId).toBe("string");
    expect(orchRunId.length).toBeGreaterThan(0);

    const empSpan = spans.find((s) => s.name === "employee.run");
    expect(empSpan).toBeDefined();
    // runId attr must be a non-empty string
    expect(typeof empSpan.attributes.runId).toBe("string");
    expect(empSpan.attributes.runId.length).toBeGreaterThan(0);
    // parentRunId on employee.run = orchestrationRunId (set as parentRunId when tool executes)
    expect(empSpan.attributes.parentRunId).toBe(orchRunId);
  },
  15000
);
