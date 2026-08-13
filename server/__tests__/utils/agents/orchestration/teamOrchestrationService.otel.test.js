"use strict";

/**
 * OTel span-hierarchy tests for TeamOrchestrationService.
 * Verifies team.orchestration root span + team.step children, parent/child wiring,
 * attrs, suspended case, and no-op (no exporter) does not throw.
 */

const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-node");
const { resetForTests } = require("../../../../utils/observability/otel");
const { TeamOrchestrationService } = require("../../../../utils/agents/orchestration/teamOrchestrationService");

// ── helpers ────────────────────────────────────────────────────────────────

function makeRunStore() {
  const store = {};
  return {
    _store: store,
    calls: { create: [], update: [], finalize: [], get: [] },
    async create({ workspaceId, threadId, goal, plan, parentRunId }) {
      const id = `run_otel_${Date.now()}_${Math.random()}`;
      store[id] = { workspaceId, threadId, goal, plan, cursor: 0, accumulatedContext: "", status: "running", parentRunId };
      this.calls.create.push({ workspaceId, threadId, goal, plan, parentRunId });
      return id;
    },
    async update(runId, patch) {
      store[runId] = { ...(store[runId] || {}), ...patch };
      this.calls.update.push({ runId, patch });
    },
    async finalize(runId, status) {
      if (store[runId]) store[runId].finalStatus = status;
      this.calls.finalize.push({ runId, status });
    },
    async get(runId) {
      return store[runId] || {};
    },
  };
}

function makeEmployees() {
  return [
    { assistantId: "analyst", name: "Data Analyst" },
    { assistantId: "reporter", name: "Reporter" },
  ];
}

function makePlan(steps) {
  return { steps, reason: "ok", error: null };
}

function successExec() {
  return jest.fn().mockResolvedValue({
    text: "result",
    sources: [],
    artifacts: [],
    runId: null,
    error: null,
  });
}

// ── setup / teardown ────────────────────────────────────────────────────────

let exporter;

beforeEach(async () => {
  exporter = new InMemorySpanExporter();
  await resetForTests({ exporter });
});

afterEach(async () => {
  await resetForTests(); // tear down — return to no-op
});

// ── Test 1: normal 2-step run → team.orchestration + 2 team.step children ──

test("normal 2-step run: 1 team.orchestration + 2 team.step children with correct parent/child", async () => {
  const executeMock = successExec();

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "step-A" },
      { assistantId: "reporter", subtask: "step-B" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
    createApprovalBroker: jest.fn().mockReturnValue({}),
  });

  const result = await svc.run({
    workspace: { id: 42 },
    goal: "test goal for otel",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  expect(result.status).toBe("done");

  const spans = exporter.getFinishedSpans();

  // ── 1 team.orchestration span ──────────────────────────────────────────
  const rootSpans = spans.filter((s) => s.name === "team.orchestration");
  expect(rootSpans).toHaveLength(1);
  const root = rootSpans[0];

  // attrs: orchestrationRunId, goalLen, maxSteps, steps, status
  expect(root.attributes).toMatchObject({
    goalLen: "test goal for otel".length,
    maxSteps: 6, // default
    steps: 2,
    status: "done",
    resumed: false,
  });
  // orchestrationRunId must be set (non-empty string)
  expect(typeof root.attributes.orchestrationRunId).toBe("string");
  expect(root.attributes.orchestrationRunId.length).toBeGreaterThan(0);

  // ── 2 team.step spans ─────────────────────────────────────────────────
  const stepSpans = spans.filter((s) => s.name === "team.step");
  expect(stepSpans).toHaveLength(2);

  // Sort by stepId attr to ensure deterministic order
  const sorted = [...stepSpans].sort((a, b) => a.attributes.stepId - b.attributes.stepId);

  // Each team.step must be a child of team.orchestration
  const rootSpanContext = root.spanContext();
  for (const stepSpan of sorted) {
    expect(stepSpan.parentSpanContext.spanId).toBe(rootSpanContext.spanId);
  }

  // stepId and assistantId attrs
  expect(sorted[0].attributes).toMatchObject({ stepId: 0, assistantId: "analyst" });
  expect(sorted[1].attributes).toMatchObject({ stepId: 1, assistantId: "reporter" });
});

// ── Test 2: approval_needed → team.orchestration attrs suspended=true, only 1 team.step ──

test("approval_needed: team.orchestration suspended=true, only 1 team.step (step2 not started)", async () => {
  const step1Execute = jest.fn().mockResolvedValue({
    text: null,
    sources: [],
    artifacts: [],
    runId: null,
    error: { code: "approval_needed", confirmationId: "c99" },
  });
  const step2Execute = jest.fn(); // should NOT be called

  let callIndex = 0;
  const buildRunEmployeeMastraTool = jest.fn().mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) return { execute: step1Execute };
    return { execute: step2Execute };
  });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "step-A" },
      { assistantId: "reporter", subtask: "step-B" },
    ])),
    buildRunEmployeeMastraTool,
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
    createApprovalBroker: jest.fn().mockReturnValue({}),
  });

  const result = await svc.run({
    workspace: { id: 10 },
    goal: "approval goal",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  expect(result.status).toBe("suspended");
  expect(step2Execute).not.toHaveBeenCalled();

  const spans = exporter.getFinishedSpans();

  // team.orchestration must exist and have suspended=true
  const rootSpans = spans.filter((s) => s.name === "team.orchestration");
  expect(rootSpans).toHaveLength(1);
  const root = rootSpans[0];
  expect(root.attributes.suspended).toBe(true);
  expect(root.attributes.status).toBe("suspended");

  // Only 1 team.step (step-A that triggered approval_needed)
  const stepSpans = spans.filter((s) => s.name === "team.step");
  expect(stepSpans).toHaveLength(1);
  expect(stepSpans[0].attributes.stepId).toBe(0);
  expect(stepSpans[0].attributes.assistantId).toBe("analyst");
});

// ── Test 3: no-op (no exporter) — run succeeds, no throw ──────────────────

test("no-op: after resetForTests() with no exporter, run succeeds without throwing", async () => {
  // Tear down the exporter-backed provider installed by beforeEach
  await resetForTests(); // no exporter → no-op tracer

  const executeMock = successExec();

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "step-A" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
    createApprovalBroker: jest.fn().mockReturnValue({}),
  });

  const result = await svc.run({
    workspace: { id: 99 },
    goal: "no-op goal",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  expect(result.status).toBe("done");
  expect(result.error).toBeNull();
  // Exporter from beforeEach has been replaced — calling it won't reflect new spans
  // But we just confirm no throw and correct result
});
