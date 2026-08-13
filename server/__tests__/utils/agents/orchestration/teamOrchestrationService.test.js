"use strict";

/**
 * Tests for TeamOrchestrationService.
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

// ── 1. 顺序执行 + context 串联 ──────────────────────────────────────────────

test("sequential execution: step2 receives step1 output as context", async () => {
  const executeMock = jest.fn()
    .mockResolvedValueOnce({ text: "分析结果", sources: [], artifacts: [], runId: null, error: null })
    .mockResolvedValueOnce({ text: "最终报告", sources: [], artifacts: [], runId: null, error: null });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "分析数据" },
      { assistantId: "reporter", subtask: "生成报告" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
  });

  const result = await svc.run({
    workspace: { id: 1 },
    goal: "数据分析+报告",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  // step2 execute call should have context = "分析结果"
  expect(executeMock).toHaveBeenCalledTimes(2);
  expect(executeMock.mock.calls[1][0].context).toBe("分析结果");
  expect(result.text).toBe("最终报告");
  expect(result.error).toBeNull();
});

// ── 2. agentTaskList 事件 ───────────────────────────────────────────────────

test("emits agentTaskList event after planning with correct tasks shape", async () => {
  const events = [];
  const executeMock = jest.fn()
    .mockResolvedValue({ text: "ok", sources: [], artifacts: [], runId: null, error: null });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "分析数据" },
      { assistantId: "reporter", subtask: "生成报告" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
    onEvent: (e) => events.push(e),
  });

  const taskListEvent = events.find((e) => e.type === "agentTaskList");
  expect(taskListEvent).toBeDefined();
  expect(taskListEvent.content.tasks).toHaveLength(2);
  expect(taskListEvent.content.tasks[0]).toMatchObject({ index: 0, assistantId: "analyst" });
  expect(taskListEvent.content.tasks[1]).toMatchObject({ index: 1, assistantId: "reporter" });
});

// ── 3. statusResponse 事件:每步"派给…"/"…完成" ─────────────────────────────

test("emits statusResponse events per step: dispatch + complete", async () => {
  const events = [];
  const executeMock = jest.fn()
    .mockResolvedValue({ text: "out", sources: [], artifacts: [], runId: null, error: null });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "分析数据" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
    onEvent: (e) => events.push(e),
  });

  const statuses = events.filter((e) => e.type === "statusResponse").map((e) => e.content);
  expect(statuses.some((s) => s.includes("Data Analyst"))).toBe(true);
  expect(statuses.some((s) => s.includes("完成"))).toBe(true);
});

// ── 4. 单步一次:正常路径每步 execute 只调 1 次 ──────────────────────────────

test("normal path: execute called exactly once per step", async () => {
  const executeMock = jest.fn()
    .mockResolvedValue({ text: "ok", sources: [], artifacts: [], runId: null, error: null });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  expect(executeMock).toHaveBeenCalledTimes(2);
});

// ── 5. 失败重试一次后跳过 ────────────────────────────────────────────────────

test("step failure: retried once then skipped, subsequent steps continue", async () => {
  const err = { code: "exec_failed", message: "boom" };
  const executeMock = jest.fn()
    // step1: fail twice
    .mockResolvedValueOnce({ text: null, sources: [], artifacts: [], runId: null, error: err })
    .mockResolvedValueOnce({ text: null, sources: [], artifacts: [], runId: null, error: err })
    // step2: success
    .mockResolvedValueOnce({ text: "step2出", sources: [], artifacts: [], runId: null, error: null });

  const runStore = makeRunStore();
  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 0,
  });

  const result = await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  // step1 called twice (original + retry), step2 called once
  expect(executeMock).toHaveBeenCalledTimes(3);

  const step1 = result.steps.find((s) => s.assistantId === "analyst");
  const step2 = result.steps.find((s) => s.assistantId === "reporter");
  expect(step1.ok).toBe(false);
  expect(step2.ok).toBe(true);

  // summary text should mention failed step
  expect(result.text).toContain("Data Analyst");
});

// ── 6. 成本预算护栏 ──────────────────────────────────────────────────────────

test("cost budget exceeded after step1: step2 not executed, finalStatus budget_exceeded", async () => {
  const executeMock = jest.fn()
    .mockResolvedValue({ text: "out", sources: [], artifacts: [], runId: null, error: null });

  const runStore = makeRunStore();
  const events = [];

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 100, // each step costs 100
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
    onEvent: (e) => events.push(e),
    config: { costBudget: 100 }, // budget equal to first step cost
  });

  // step1 runs (cost check is BEFORE executing, so budget=100 >= 0 initially passes)
  // After step1, cost=100 >= budget=100 → step2 blocked (with >= guard)
  expect(executeMock).toHaveBeenCalledTimes(1);

  const budgetEvent = events.find((e) => e.type === "statusResponse" && e.content.includes("预算"));
  expect(budgetEvent).toBeDefined();

  expect(runStore.calls.finalize[0].status).toBe("budget_exceeded");
});

// ── 7. 取消 (AbortSignal) ────────────────────────────────────────────────────

test("abort signal: loop stops, returns aborted error", async () => {
  const controller = new AbortController();

  let callCount = 0;
  const executeMock = jest.fn().mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      // abort after first step executes
      controller.abort();
    }
    return { text: "out", sources: [], artifacts: [], runId: null, error: null };
  });

  const runStore = makeRunStore();

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 0,
  });

  const result = await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
    signal: controller.signal,
  });

  // step1 runs, step2 is blocked by abort check at top of loop
  expect(executeMock).toHaveBeenCalledTimes(1);
  expect(result.error).toBeDefined();
  expect(result.error.code).toBe("aborted");
  expect(result.text).toBe("团队运行已取消。");
  expect(runStore.calls.finalize[0].status).toBe("cancelled");
});

// ── 8. 持久化:create/update/finalize ────────────────────────────────────────

test("runStore: create called once with goal+plan, update per step, finalize at end", async () => {
  const executeMock = jest.fn()
    .mockResolvedValue({ text: "结果", sources: [], artifacts: [], runId: null, error: null });

  const runStore = makeRunStore();

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 0,
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "test goal",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  // create called once
  expect(runStore.calls.create).toHaveLength(1);
  expect(runStore.calls.create[0].goal).toBe("test goal");
  expect(runStore.calls.create[0].plan).toHaveLength(2);

  // update called once per step (cursor 1, then 2)
  expect(runStore.calls.update).toHaveLength(2);
  expect(runStore.calls.update[0].patch.cursor).toBe(1);
  expect(runStore.calls.update[1].patch.cursor).toBe(2);

  // finalize called once with "done"
  expect(runStore.calls.finalize).toHaveLength(1);
  expect(runStore.calls.finalize[0].status).toBe("done");
});

// ── 9. 无有效计划 ────────────────────────────────────────────────────────────

test("no valid plan: no run created, returns error, execute never called", async () => {
  const executeMock = jest.fn();
  const runStore = makeRunStore();

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue({ steps: [], reason: "empty", error: { code: "no_valid_steps", message: "none" } }),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 0,
  });

  const result = await svc.run({
    workspace: { id: 1 },
    goal: "impossible goal",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  expect(executeMock).not.toHaveBeenCalled();
  expect(runStore.calls.create).toHaveLength(0);
  expect(result.error).toBeDefined();
  expect(result.error.code).toBe("no_valid_steps");
  expect(result.runId).toBeNull();
});

// ── 10. 失败步骤的 context 不更新为失败内容 ──────────────────────────────────

test("failed step does not update accumulatedContext to error/null; keeps prior context", async () => {
  const err = { code: "exec_failed", message: "boom" };
  const executeMock = jest.fn()
    // step1: success, outputs "step1_result"
    .mockResolvedValueOnce({ text: "step1_result", sources: [], artifacts: [], runId: null, error: null })
    // step2: fail twice (no text to feed forward)
    .mockResolvedValueOnce({ text: null, sources: [], artifacts: [], runId: null, error: err })
    .mockResolvedValueOnce({ text: null, sources: [], artifacts: [], runId: null, error: err })
    // step3: success with context from step1 (not null)
    .mockResolvedValueOnce({ text: "step3_result", sources: [], artifacts: [], runId: null, error: null });

  const runStore = makeRunStore();
  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
      { assistantId: "analyst", subtask: "步骤3" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore,
    estimateStepCost: () => 0,
  });

  await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  // After step1 succeeds, update should have accumulatedContext = "step1_result"
  const step1Update = runStore.calls.update[0];
  expect(step1Update.patch.accumulatedContext).toBe("step1_result");

  // After step2 fails, update should STILL have accumulatedContext = "step1_result" (not null, not error text)
  const step2Update = runStore.calls.update[1];
  expect(step2Update.patch.accumulatedContext).toBe("step1_result");

  // After step3 succeeds, update should have new output
  const step3Update = runStore.calls.update[2];
  expect(step3Update.patch.accumulatedContext).toBe("step3_result");
});

// ── 11. sources 汇总去重 ─────────────────────────────────────────────────────

test("sources deduped by id across steps", async () => {
  const sharedSource = { id: "src-1", url: "http://example.com" };
  const uniqueSource = { id: "src-2", url: "http://other.com" };

  const executeMock = jest.fn()
    .mockResolvedValueOnce({ text: "step1", sources: [sharedSource], artifacts: [], runId: null, error: null })
    .mockResolvedValueOnce({ text: "step2", sources: [sharedSource, uniqueSource], artifacts: [], runId: null, error: null });

  const svc = new TeamOrchestrationService({
    createPlan: jest.fn().mockResolvedValue(makePlan([
      { assistantId: "analyst", subtask: "步骤1" },
      { assistantId: "reporter", subtask: "步骤2" },
    ])),
    buildRunEmployeeMastraTool: jest.fn().mockReturnValue({ execute: executeMock }),
    runStore: makeRunStore(),
    estimateStepCost: () => 0,
  });

  const result = await svc.run({
    workspace: { id: 1 },
    goal: "g",
    employees: makeEmployees(),
    generateText: jest.fn(),
  });

  // src-1 appears twice but should be deduped to once
  expect(result.sources).toHaveLength(2);
  const ids = result.sources.map((s) => s.id);
  expect(ids).toContain("src-1");
  expect(ids).toContain("src-2");
});
