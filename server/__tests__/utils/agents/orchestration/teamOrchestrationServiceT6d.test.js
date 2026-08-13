"use strict";

/**
 * T6d tests: approvalDelegate threading, suspend-on-approval_needed,
 * resumeState re-entry, per-step broker injection.
 * All dependencies injected as fakes — no real DB, no real models.
 */

const { TeamOrchestrationService } = require("../../../../utils/agents/orchestration/teamOrchestrationService");

// ── helpers ────────────────────────────────────────────────────────────────

function makeRunStore() {
  const store = {};
  return {
    _store: store,
    calls: { create: [], update: [], finalize: [], get: [] },
    async create({ workspaceId, threadId, goal, plan, parentRunId }) {
      const id = `run_${Date.now()}_${Math.random()}`;
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

// ── T6d.1 suspend on approval_needed ────────────────────────────────────────

describe("T6d — suspend on approval_needed", () => {
  test("step1 returns approval_needed → run returns suspended, runStore updated, finalize NOT called, step2 NOT executed", async () => {
    const step1Execute = jest.fn().mockResolvedValue({
      text: null,
      sources: [],
      artifacts: [],
      runId: null,
      error: { code: "approval_needed", confirmationId: "c1" },
    });
    const step2Execute = jest.fn(); // should NOT be called

    // Each per-step tool call returns a distinct tool object
    let callIndex = 0;
    const buildRunEmployeeMastraTool = jest.fn().mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return { execute: step1Execute };
      return { execute: step2Execute };
    });

    const runStore = makeRunStore();
    const createApprovalBroker = jest.fn().mockReturnValue({ /* broker stub */ requestApproval: jest.fn() });

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue(makePlan([
        { assistantId: "analyst", subtask: "步骤1" },
        { assistantId: "reporter", subtask: "步骤2" },
      ])),
      buildRunEmployeeMastraTool,
      runStore,
      estimateStepCost: () => 0,
      createApprovalBroker,
    });

    const result = await svc.run({
      workspace: { id: 1 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
    });

    // Must return suspended shape
    expect(result.status).toBe("suspended");
    expect(result.confirmationId).toBe("c1");
    expect(result.runId).toBeTruthy();
    expect(result.error).toBeNull();
    expect(result.text).toBeNull();

    // step2 must NOT have been called
    expect(step2Execute).not.toHaveBeenCalled();

    // step1 must have been called exactly once (no retry!)
    expect(step1Execute).toHaveBeenCalledTimes(1);

    // runStore.update must record cursor=0 (current step, not i+1), status=suspended, pendingConfirmationId
    const suspendUpdate = runStore.calls.update.find(u => u.patch.status === "suspended");
    expect(suspendUpdate).toBeDefined();
    expect(suspendUpdate.patch.cursor).toBe(0);
    expect(suspendUpdate.patch.pendingConfirmationId).toBe("c1");

    // finalize must NOT have been called
    expect(runStore.calls.finalize).toHaveLength(0);
  });

  test("approval_needed does NOT trigger retry (execute called only once)", async () => {
    const executeMock = jest.fn().mockResolvedValue({
      text: null,
      sources: [],
      artifacts: [],
      runId: null,
      error: { code: "approval_needed", confirmationId: "c42" },
    });

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue(makePlan([
        { assistantId: "analyst", subtask: "步骤1" },
      ])),
      buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
      createApprovalBroker: jest.fn().mockReturnValue({}),
    });

    await svc.run({
      workspace: { id: 1 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
    });

    // Only 1 call — no retry on approval_needed
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});

// ── T6d.2 resumeState re-entry ────────────────────────────────────────────────

describe("T6d — resumeState re-entry", () => {
  test("resumeState: skips createPlan, skips runStore.create, starts from cursor, uses accumulatedContext", async () => {
    const step1Execute = jest.fn(); // should NOT be called (cursor=1 means start from index 1)
    const step2Execute = jest.fn().mockResolvedValue({
      text: "step2出",
      sources: [],
      artifacts: [],
      runId: null,
      error: null,
    });

    let toolCallIndex = 0;
    const buildRunEmployeeMastraTool = jest.fn().mockImplementation(() => {
      toolCallIndex++;
      if (toolCallIndex === 1) return { execute: step2Execute };
      return { execute: jest.fn() };
    });

    const runStore = makeRunStore();
    const createPlan = jest.fn(); // must NOT be called
    const createApprovalBroker = jest.fn().mockReturnValue({});

    const svc = new TeamOrchestrationService({
      createPlan,
      buildRunEmployeeMastraTool,
      runStore,
      estimateStepCost: () => 0,
      createApprovalBroker,
    });

    const resumeState = {
      runId: "r1",
      plan: [
        { assistantId: "analyst", subtask: "步骤1" },
        { assistantId: "reporter", subtask: "步骤2" },
      ],
      cursor: 1,
      accumulatedContext: "ctx1",
    };

    const result = await svc.run({
      workspace: { id: 1 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
      resumeState,
    });

    // createPlan must NOT have been called
    expect(createPlan).not.toHaveBeenCalled();

    // runStore.create must NOT have been called
    expect(runStore.calls.create).toHaveLength(0);

    // step1 (index 0) must NOT have been called
    expect(step1Execute).not.toHaveBeenCalled();

    // step2 (index 1) must have been called with context = "ctx1" (accumulatedContext from resumeState)
    expect(step2Execute).toHaveBeenCalledTimes(1);
    expect(step2Execute.mock.calls[0][0].context).toBe("ctx1");

    // orchestrationRunId must be r1 (from resumeState)
    expect(result.runId).toBe("r1");

    // finalize must be called (normal completion)
    expect(runStore.calls.finalize).toHaveLength(1);

    // result must have correct text
    expect(result.text).toBe("step2出");
  });

  test("resumeState: agentTaskList NOT re-emitted on resume", async () => {
    const events = [];
    const executeMock = jest.fn().mockResolvedValue({
      text: "out",
      sources: [],
      artifacts: [],
      runId: null,
      error: null,
    });

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn(),
      buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
      createApprovalBroker: jest.fn().mockReturnValue({}),
    });

    const resumeState = {
      runId: "r2",
      plan: [{ assistantId: "analyst", subtask: "步骤1" }],
      cursor: 0,
      accumulatedContext: "",
    };

    await svc.run({
      workspace: { id: 1 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
      onEvent: (e) => events.push(e),
      resumeState,
    });

    // Must NOT emit agentTaskList on resume
    const taskListEvents = events.filter(e => e.type === "agentTaskList");
    expect(taskListEvents).toHaveLength(0);
  });
});

// ── T6d.3 per-step broker injection ──────────────────────────────────────────

describe("T6d — per-step broker injection", () => {
  test("createApprovalBroker called once per step with correct stepId and orchestrationRunId", async () => {
    const executeMock = jest.fn().mockResolvedValue({
      text: "ok",
      sources: [],
      artifacts: [],
      runId: null,
      error: null,
    });

    const broker = { requestApproval: jest.fn() };
    const createApprovalBroker = jest.fn().mockReturnValue(broker);
    const runStore = makeRunStore();

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue(makePlan([
        { assistantId: "analyst", subtask: "步骤1" },
        { assistantId: "reporter", subtask: "步骤2" },
      ])),
      buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
      runStore,
      estimateStepCost: () => 0,
      createApprovalBroker,
    });

    await svc.run({
      workspace: { id: 5 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
    });

    // createApprovalBroker called once per step = 2 times
    expect(createApprovalBroker).toHaveBeenCalledTimes(2);

    // First call: stepId=0
    expect(createApprovalBroker.mock.calls[0][0]).toMatchObject({
      stepId: 0,
      workspaceId: 5,
    });
    // Must receive orchestrationRunId (a truthy string)
    expect(createApprovalBroker.mock.calls[0][0].orchestrationRunId).toBeTruthy();

    // Second call: stepId=1
    expect(createApprovalBroker.mock.calls[1][0]).toMatchObject({
      stepId: 1,
      workspaceId: 5,
    });
  });

  test("broker passed as approvalDelegate to buildRunEmployeeMastraTool", async () => {
    const executeMock = jest.fn().mockResolvedValue({
      text: "ok",
      sources: [],
      artifacts: [],
      runId: null,
      error: null,
    });

    const broker = { requestApproval: jest.fn() };
    const createApprovalBroker = jest.fn().mockReturnValue(broker);
    const buildRunEmployeeMastraTool = jest.fn().mockReturnValue({ execute: executeMock });

    const svc = new TeamOrchestrationService({
      createPlan: jest.fn().mockResolvedValue(makePlan([
        { assistantId: "analyst", subtask: "步骤1" },
      ])),
      buildRunEmployeeMastraTool,
      runStore: makeRunStore(),
      estimateStepCost: () => 0,
      createApprovalBroker,
    });

    await svc.run({
      workspace: { id: 1 },
      goal: "g",
      employees: makeEmployees(),
      generateText: jest.fn(),
    });

    // buildRunEmployeeMastraTool must have been called with approvalDelegate = broker
    expect(buildRunEmployeeMastraTool).toHaveBeenCalledWith(
      expect.objectContaining({ approvalDelegate: broker })
    );
  });
});

// ── T6d.4 approvalDelegate passthrough in runEmployeeMastraTool ──────────────

describe("T6d — approvalDelegate passthrough in buildRunEmployeeMastraTool", () => {
  const { buildRunEmployeeMastraTool } = require("../../../../utils/agents/orchestration/runEmployeeMastraTool");

  function makeMocks(invokeResult = { text: "ok", sources: [], artifacts: [], runId: null, error: null }) {
    const mockInvoke = jest.fn().mockResolvedValue(invokeResult);
    const mockCreateRunEmployeeTool = jest.fn().mockReturnValue({ invoke: mockInvoke });
    const mockLoadMastra = jest.fn().mockReturnValue({
      createTool: (config) => config,
      z: {
        object: (schema) => schema,
        string: () => ({ optional: () => ({}) }),
      },
    });
    return { mockInvoke, mockCreateRunEmployeeTool, mockLoadMastra };
  }

  test("approvalDelegate passed to createRunEmployeeTool", () => {
    const { mockCreateRunEmployeeTool, mockLoadMastra } = makeMocks();
    const fakeDelegate = { requestApproval: jest.fn() };

    buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
      approvalDelegate: fakeDelegate,
    });

    expect(mockCreateRunEmployeeTool).toHaveBeenCalledWith(
      expect.objectContaining({ approvalDelegate: fakeDelegate })
    );
  });

  test("approvalDelegate=null when not provided (default null)", () => {
    const { mockCreateRunEmployeeTool, mockLoadMastra } = makeMocks();

    buildRunEmployeeMastraTool({
      workspace: { id: "ws-1" },
      loadMastra: mockLoadMastra,
      createRunEmployeeTool: mockCreateRunEmployeeTool,
      // no approvalDelegate
    });

    expect(mockCreateRunEmployeeTool).toHaveBeenCalledWith(
      expect.objectContaining({ approvalDelegate: null })
    );
  });
});

// ── T6d.5 approvalDelegate passthrough in createRunEmployeeTool ───────────────

describe("T6d — approvalDelegate passthrough in createRunEmployeeTool", () => {
  const { createRunEmployeeTool } = require("../../../../utils/agents/employeeRun/runEmployeeTool");

  test("approvalDelegate in boundContext passed to service.run", async () => {
    const mockResult = {
      text: "ok",
      artifacts: [],
      sources: [],
      events: [],
      runId: "r1",
      usage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    };
    const mockService = { run: jest.fn().mockResolvedValue(mockResult) };
    const fakeDelegate = { requestApproval: jest.fn() };

    const tool = createRunEmployeeTool({
      workspace: { id: "ws1" },
      service: mockService,
      approvalDelegate: fakeDelegate,
    });

    await tool.invoke({ assistantId: "a1", task: "test" });

    expect(mockService.run).toHaveBeenCalledWith(
      expect.objectContaining({ approvalDelegate: fakeDelegate })
    );
  });

  test("approvalDelegate=null when not provided", async () => {
    const mockResult = {
      text: "ok",
      artifacts: [],
      sources: [],
      events: [],
      runId: "r1",
      usage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    };
    const mockService = { run: jest.fn().mockResolvedValue(mockResult) };

    const tool = createRunEmployeeTool({
      workspace: { id: "ws1" },
      service: mockService,
      // no approvalDelegate
    });

    await tool.invoke({ assistantId: "a1", task: "test" });

    expect(mockService.run).toHaveBeenCalledWith(
      expect.objectContaining({ approvalDelegate: null })
    );
  });
});
