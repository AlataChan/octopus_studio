"use strict";

const { TeamOrchestrationService } = require("../teamOrchestrationService");

function makeRunStore() {
  const records = new Map();
  let seq = 0;
  return {
    records,
    async create({ goal, plan, executionVersion, executionMode, stepStates, sharedContext }) {
      const id = `run-${++seq}`;
      records.set(id, {
        stateVersion: 0,
        metadata: {
          kind: "team_orchestration",
          goal,
          plan,
          cursor: 0,
          accumulatedContext: goal,
          status: "running",
          executionVersion,
          executionMode,
          planRevision: executionVersion === 2 ? 1 : undefined,
          stepStates,
          sharedContext,
          cumulativeCost: 0,
          reviewCount: 0,
        },
      });
      return id;
    },
    async get(id) {
      const row = records.get(id);
      return {
        stateVersion: row.stateVersion,
        metadata: JSON.parse(JSON.stringify(row.metadata)),
        ...JSON.parse(JSON.stringify(row.metadata)),
      };
    },
    async update(id, patch) {
      const row = records.get(id);
      row.metadata = { ...row.metadata, ...patch };
    },
    async casUpdate(id, expected, nextMetadata) {
      const row = records.get(id);
      if (row.stateVersion !== expected) return { ok: false, conflict: true };
      row.stateVersion += 1;
      row.metadata = JSON.parse(JSON.stringify(nextMetadata));
      return { ok: true, stateVersion: row.stateVersion };
    },
    async finalize(id, status) {
      const row = records.get(id);
      row.finalStatus = status;
    },
  };
}

function seedV2Run(runStore, id, overrides = {}) {
  const plan = overrides.plan || [{ assistantId: "a", subtask: "one" }];
  runStore.records.set(id, {
    stateVersion: 0,
    metadata: {
      kind: "team_orchestration",
      goal: "coordinate",
      plan,
      cursor: 0,
      accumulatedContext: "coordinate",
      status: "running",
      executionVersion: 2,
      executionMode: overrides.executionMode || "serial",
      planRevision: 1,
      stepStates: overrides.stepStates || plan.map((step, index) => ({
        index,
        planRevision: 1,
        status: "pending",
        attemptId: null,
        leaseUntil: null,
        resultRef: null,
        confirmationId: null,
        attempts: 0,
        readOnly: step.readOnly === true,
      })),
      sharedContext: {},
      cumulativeCost: 0,
      reviewCount: overrides.reviewCount || 0,
      ...overrides.metadata,
    },
  });
}

const baseArgs = {
  workspace: { id: 1, chatProvider: "openai", chatModel: "base" },
  user: { id: 2 },
  thread: null,
  goal: "coordinate",
  employees: [
    { assistantId: "a", name: "A" },
    { assistantId: "b", name: "B" },
    { assistantId: "reviewer", name: "R" },
  ],
  generateText: async () => "[]",
  onEvent: () => {},
};

describe("swarm loop v2", () => {
  beforeEach(() => {
    process.env.TEAM_ORCHESTRATION_ENABLED = "true";
    process.env.SWARM_ORCHESTRATION_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.TEAM_ORCHESTRATION_ENABLED;
    delete process.env.SWARM_ORCHESTRATION_ENABLED;
  });

  it("runs read-only groups concurrently and persists v2 state", async () => {
    const runStore = makeRunStore();
    const starts = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;

    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          { assistantId: "a", subtask: "one", group: "g1", readOnly: true },
          { assistantId: "b", subtask: "two", group: "g1", readOnly: true },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ task }) => {
          starts.push({ task, readOnly });
          active += 1;
          peak = Math.max(peak, active);
          if (starts.length === 2) release();
          await gate;
          active -= 1;
          return { text: `${task}-done`, sources: [], artifacts: [] };
        },
      }),
    });

    const res = await svc.run({ ...baseArgs });
    const metadata = runStore.records.get(res.runId).metadata;

    expect(peak).toBe(2);
    expect(starts).toEqual([
      { task: "one", readOnly: true },
      { task: "two", readOnly: true },
    ]);
    expect(metadata.executionVersion).toBe(2);
    expect(metadata.executionMode).toBe("grouped");
    expect(metadata.stepStates.map((s) => s.status)).toEqual(["done", "done"]);
    expect(metadata.cursor).toBe(2);
  });

  it("forces reviewer runs to read-only and caps automatic review attempts", async () => {
    const runStore = makeRunStore();
    const calls = [];
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          {
            assistantId: "a",
            subtask: "draft",
            readOnly: true,
            reviewerAssistantId: "reviewer",
          },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId, task }) => {
          calls.push({ assistantId, task, readOnly });
          if (assistantId === "reviewer") {
            return { text: JSON.stringify({ pass: false, feedback: "retry" }) };
          }
          return { text: "draft result", sources: [], artifacts: [] };
        },
      }),
    });

    const res = await svc.run({ ...baseArgs });
    const metadata = runStore.records.get(res.runId).metadata;

    expect(calls.filter((c) => c.assistantId === "reviewer")).toHaveLength(3);
    expect(calls.filter((c) => c.assistantId === "reviewer").every((c) => c.readOnly)).toBe(true);
    expect(metadata.reviewCount).toBe(3);
    expect(metadata.stepStates[0].status).toBe("failed");
  });

  it("fails closed when a reviewer step cannot reserve a review slot", async () => {
    const runStore = makeRunStore();
    const plan = [
      {
        assistantId: "a",
        subtask: "write",
        readOnly: true,
        reviewerAssistantId: "reviewer",
      },
    ];
    seedV2Run(runStore, "run-v2", { plan, reviewCount: 3 });
    const reviewerExecute = jest.fn();
    const svc = new TeamOrchestrationService({
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId }) => {
          if (assistantId === "reviewer") {
            reviewerExecute();
            return { text: JSON.stringify({ pass: true, feedback: "ok" }) };
          }
          return { text: "worker result", sources: [], artifacts: [] };
        },
      }),
    });

    const outcome = await svc._executeV2Step({
      orchestrationRunId: "run-v2",
      index: 0,
      step: plan[0],
      context: "ctx",
      workspace: baseArgs.workspace,
      user: baseArgs.user,
      thread: baseArgs.thread,
      signal: null,
      onEvent: () => {},
      employees: baseArgs.employees,
      allowReviewer: true,
    });
    const metadata = runStore.records.get("run-v2").metadata;

    expect(reviewerExecute).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(outcome.stepResult.error.code).toBe("review_limit_reached");
    expect(metadata.reviewCount).toBe(3);
    expect(metadata.stepStates[0].status).toBe("failed");
  });

  it("mid-flight flag off resumes v2 serially but still runs required reviewer", async () => {
    const runStore = makeRunStore();
    runStore.records.set("run-v2", {
      stateVersion: 0,
      metadata: {
        executionVersion: 2,
        executionMode: "grouped",
        planRevision: 1,
        goal: "coordinate",
        plan: [
          { assistantId: "a", subtask: "done", group: "g1", readOnly: true },
          {
            assistantId: "b",
            subtask: "remaining",
            group: "g1",
            readOnly: true,
            reviewerAssistantId: "reviewer",
          },
        ],
        stepStates: [
          { index: 0, planRevision: 1, status: "done", readOnly: true },
          { index: 1, planRevision: 1, status: "pending", readOnly: true },
        ],
        sharedContext: {},
        cursor: 1,
        accumulatedContext: "done",
        reviewCount: 0,
      },
    });
    delete process.env.SWARM_ORCHESTRATION_ENABLED;

    const calls = [];
    const svc = new TeamOrchestrationService({
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId, task }) => {
          calls.push({ assistantId, task, readOnly });
          if (assistantId === "reviewer") {
            return { text: JSON.stringify({ pass: true, feedback: "ok" }) };
          }
          return { text: "remaining result", sources: [], artifacts: [] };
        },
      }),
    });

    const res = await svc.run({
      ...baseArgs,
      resumeState: {
        runId: "run-v2",
        plan: runStore.records.get("run-v2").metadata.plan,
        cursor: 1,
        accumulatedContext: "done",
        executionVersion: 2,
      },
    });

    expect(res.status).toBe("done");
    expect(calls).toEqual([
      { assistantId: "b", task: "remaining", readOnly: true },
      {
        assistantId: "reviewer",
        task: "Review the previous result. Return strict JSON only: {\"pass\":boolean,\"feedback\":\"...\"}",
        readOnly: true,
      },
    ]);
    expect(runStore.records.get("run-v2").metadata.executionMode).toBe("serial");
    expect(runStore.records.get("run-v2").metadata.reviewCount).toBe(1);
  });

  it("injects the full shared context snapshot into later grouped v2 steps", async () => {
    const runStore = makeRunStore();
    const contexts = {};
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          { assistantId: "a", subtask: "first", group: "g1", readOnly: true },
          { assistantId: "b", subtask: "second", group: "g2", readOnly: true },
          { assistantId: "a", subtask: "third", group: "g2", readOnly: true },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: () => ({
        execute: async ({ task, context }) => {
          contexts[task] = context;
          return { text: `${task} result`, sources: [], artifacts: [] };
        },
      }),
    });

    await svc.run({ ...baseArgs });

    expect(runStore.records.get("run-1").metadata.executionMode).toBe("grouped");
    expect(contexts.second).toContain("step:0: first result");
  });

  it("stops v2 progression at needs_reconciliation without finalizing done", async () => {
    const runStore = makeRunStore();
    const execute = jest.fn().mockResolvedValue({ text: "should not run" });
    const plan = [
      { assistantId: "a", subtask: "reconcile me" },
      { assistantId: "b", subtask: "do not pass" },
    ];
    seedV2Run(runStore, "run-v2", {
      plan,
      stepStates: [
        { index: 0, planRevision: 1, status: "needs_reconciliation", readOnly: false },
        { index: 1, planRevision: 1, status: "pending", readOnly: false },
      ],
    });
    const svc = new TeamOrchestrationService({
      runStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: () => ({ execute }),
    });

    const res = await svc.run({
      ...baseArgs,
      resumeState: {
        runId: "run-v2",
        plan,
        cursor: 0,
        accumulatedContext: "coordinate",
        executionVersion: 2,
      },
    });

    expect(res.status).toBe("needs_reconciliation");
    expect(execute).not.toHaveBeenCalled();
    expect(runStore.records.get("run-v2").finalStatus).toBeUndefined();
    expect(runStore.records.get("run-v2").metadata.stepStates[1].status).toBe("pending");
  });

  it("suspends v2 progression at awaiting_approval without executing later steps", async () => {
    const runStore = makeRunStore();
    const execute = jest.fn().mockResolvedValue({ text: "should not run" });
    const plan = [
      { assistantId: "a", subtask: "approve me" },
      { assistantId: "b", subtask: "do not pass" },
    ];
    seedV2Run(runStore, "run-v2", {
      plan,
      stepStates: [
        {
          index: 0,
          planRevision: 1,
          status: "awaiting_approval",
          confirmationId: "confirm-1",
          readOnly: false,
        },
        { index: 1, planRevision: 1, status: "pending", readOnly: false },
      ],
    });
    const svc = new TeamOrchestrationService({
      runStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: () => ({ execute }),
    });

    const res = await svc.run({
      ...baseArgs,
      resumeState: {
        runId: "run-v2",
        plan,
        cursor: 0,
        accumulatedContext: "coordinate",
        executionVersion: 2,
      },
    });

    expect(res.status).toBe("suspended");
    expect(res.confirmationId).toBe("confirm-1");
    expect(execute).not.toHaveBeenCalled();
    expect(runStore.records.get("run-v2").finalStatus).toBeUndefined();
    expect(runStore.records.get("run-v2").metadata.stepStates[1].status).toBe("pending");
  });

  it("fails closed when claimStep returns conflict or missing_step", async () => {
    const plan = [{ assistantId: "a", subtask: "must claim first" }];

    const conflictStore = makeRunStore();
    seedV2Run(conflictStore, "run-conflict", { plan });
    conflictStore.casUpdate = jest.fn().mockResolvedValue({ ok: false, conflict: true });
    const conflictExecute = jest.fn().mockResolvedValue({ text: "unsafe" });
    const conflictSvc = new TeamOrchestrationService({
      runStore: conflictStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: () => ({ execute: conflictExecute }),
    });

    const conflict = await conflictSvc._executeV2Step({
      orchestrationRunId: "run-conflict",
      index: 0,
      step: plan[0],
      context: "ctx",
      workspace: baseArgs.workspace,
      user: baseArgs.user,
      thread: baseArgs.thread,
      signal: null,
      onEvent: () => {},
      employees: baseArgs.employees,
      allowReviewer: true,
    });

    expect(conflict.claimConflict).toBe(true);
    expect(conflictExecute).not.toHaveBeenCalled();

    const missingStore = makeRunStore();
    seedV2Run(missingStore, "run-missing", { plan, stepStates: [] });
    const missingExecute = jest.fn().mockResolvedValue({ text: "unsafe" });
    const missingSvc = new TeamOrchestrationService({
      runStore: missingStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: () => ({ execute: missingExecute }),
    });

    const missing = await missingSvc._executeV2Step({
      orchestrationRunId: "run-missing",
      index: 0,
      step: plan[0],
      context: "ctx",
      workspace: baseArgs.workspace,
      user: baseArgs.user,
      thread: baseArgs.thread,
      signal: null,
      onEvent: () => {},
      employees: baseArgs.employees,
      allowReviewer: true,
    });

    expect(missing.claimFailed).toBe(true);
    expect(missing.stepResult.error.code).toBe("claim_missing_step");
    expect(missingExecute).not.toHaveBeenCalled();
  });

  it("reviews non-read-only steps that declare reviewerAssistantId", async () => {
    const runStore = makeRunStore();
    const calls = [];
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          {
            assistantId: "a",
            subtask: "write",
            readOnly: false,
            reviewerAssistantId: "reviewer",
          },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId, task }) => {
          calls.push({ assistantId, task, readOnly });
          if (assistantId === "reviewer") {
            return { text: JSON.stringify({ pass: true, feedback: "ok" }) };
          }
          return { text: "write result", sources: [], artifacts: [] };
        },
      }),
    });

    await svc.run({ ...baseArgs });
    const reviewerCalls = calls.filter((call) => call.assistantId === "reviewer");

    expect(reviewerCalls).toHaveLength(1);
    expect(reviewerCalls[0].readOnly).toBe(true);
    expect(runStore.records.get("run-1").metadata.reviewCount).toBe(1);
  });

  it("rejects reviewer output that is not exactly pass boolean and feedback string", async () => {
    const runStore = makeRunStore();
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          {
            assistantId: "a",
            subtask: "write",
            readOnly: false,
            reviewerAssistantId: "reviewer",
          },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: false }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId }) => {
          if (assistantId === "reviewer") {
            return { text: JSON.stringify({ pass: true, extra: "not allowed" }) };
          }
          return { text: "write result", sources: [], artifacts: [] };
        },
      }),
    });

    await svc.run({ ...baseArgs });
    const metadata = runStore.records.get("run-1").metadata;

    expect(metadata.reviewCount).toBe(1);
    expect(metadata.stepStates[0].status).toBe("failed");
  });

  it("enforces a run-level review limit across steps", async () => {
    const runStore = makeRunStore();
    const reviewerCalls = [];
    let reviewAttempt = 0;
    const svc = new TeamOrchestrationService({
      createPlan: async () => ({
        steps: [
          {
            assistantId: "a",
            subtask: "first",
            readOnly: true,
            reviewerAssistantId: "reviewer",
          },
          {
            assistantId: "b",
            subtask: "second",
            readOnly: true,
            reviewerAssistantId: "reviewer",
          },
        ],
      }),
      runStore,
      auditStepReadOnly: async () => ({ readOnly: true }),
      resolveModelOverride: async () => null,
      buildRunEmployeeMastraTool: ({ readOnly }) => ({
        execute: async ({ assistantId, task }) => {
          if (assistantId === "reviewer") {
            reviewAttempt += 1;
            reviewerCalls.push({ task, readOnly });
            return {
              text: JSON.stringify({
                pass: reviewAttempt === 2,
                feedback: "retry",
              }),
            };
          }
          return { text: `${task} result`, sources: [], artifacts: [] };
        },
      }),
    });

    await svc.run({ ...baseArgs });
    const metadata = runStore.records.get("run-1").metadata;

    expect(reviewerCalls).toHaveLength(3);
    expect(reviewerCalls.every((call) => call.readOnly)).toBe(true);
    expect(metadata.reviewCount).toBe(3);
    expect(metadata.stepStates.map((state) => state.status)).toEqual(["done", "failed"]);
  });
});
