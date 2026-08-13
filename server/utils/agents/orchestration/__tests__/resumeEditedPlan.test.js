"use strict";

const {
  createOrchestrationResumeService,
} = require("../orchestrationResumeService");

const originalPlan = [
  { assistantId: "a-0", subtask: "original step 0" },
  { assistantId: "a-1", subtask: "original step 1" },
];

const editedPlan = [
  { assistantId: "a-1", subtask: "edited first step" },
  { assistantId: "a-0", subtask: "edited second step" },
];

function makeDeps(overrides = {}) {
  const confirmation = {
    id: 42,
    workspaceId: 7,
    userId: 11,
    threadId: 22,
    planDetails: JSON.stringify({
      kind: "team_step",
      orchestrationRunId: "run-1",
      stepId: "plan",
    }),
  };

  const state = {
    plan: originalPlan,
    cursor: 0,
    accumulatedContext: "existing context",
  };

  return {
    orchestrationService: {
      run: jest.fn().mockResolvedValue({ status: "done", text: "done" }),
    },
    runStore: {
      get: jest.fn().mockResolvedValue(state),
      update: jest.fn().mockResolvedValue(undefined),
    },
    getConfirmation: jest.fn().mockResolvedValue(confirmation),
    loadWorkspace: jest.fn().mockResolvedValue({ id: 7 }),
    loadUser: jest.fn().mockResolvedValue({ id: 11 }),
    loadThread: jest.fn().mockResolvedValue({ id: 22 }),
    listEmployees: jest.fn().mockResolvedValue([
      { assistantId: "a-0", name: "Alice" },
      { assistantId: "a-1", name: "Bob" },
    ]),
    buildGenerateText: jest.fn().mockReturnValue(jest.fn()),
    buildOnEvent: jest.fn().mockReturnValue(jest.fn()),
    persistResult: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function resumePlanFrom(deps) {
  return deps.orchestrationService.run.mock.calls[0][0].resumeState.plan;
}

describe("resume edited plan", () => {
  it("plan confirmation + valid editedSteps persists and resumes with edited plan", async () => {
    const deps = makeDeps();
    const svc = createOrchestrationResumeService(deps);

    await svc.resume(42, { editedSteps: editedPlan });

    expect(deps.runStore.update).toHaveBeenCalledWith("run-1", {
      plan: editedPlan,
    });
    expect(resumePlanFrom(deps)).toBe(editedPlan);
  });

  it("unknown assistantId ignores editedSteps and resumes with original plan", async () => {
    const deps = makeDeps();
    const svc = createOrchestrationResumeService(deps);

    await svc.resume(42, {
      editedSteps: [{ assistantId: "unknown", subtask: "do something" }],
    });

    expect(deps.runStore.update).not.toHaveBeenCalled();
    expect(resumePlanFrom(deps)).toBe(originalPlan);
  });

  it("non-plan team_step confirmation ignores editedSteps", async () => {
    const deps = makeDeps({
      getConfirmation: jest.fn().mockResolvedValue({
        id: 42,
        workspaceId: 7,
        userId: 11,
        threadId: 22,
        planDetails: JSON.stringify({
          kind: "team_step",
          orchestrationRunId: "run-1",
          stepId: "step-0",
        }),
      }),
    });
    const svc = createOrchestrationResumeService(deps);

    await svc.resume(42, { editedSteps: editedPlan });

    expect(deps.runStore.update).not.toHaveBeenCalled();
    expect(resumePlanFrom(deps)).toBe(originalPlan);
  });

  it("invalid editedSteps are ignored as a whole", async () => {
    const invalidCases = [
      "not-array",
      [],
      [{ assistantId: "a-0", subtask: "" }],
      [{ assistantId: 1, subtask: "bad assistant id" }],
      Array.from({ length: 9 }, (_, i) => ({
        assistantId: "a-0",
        subtask: `too many ${i}`,
      })),
    ];

    for (const editedSteps of invalidCases) {
      const deps = makeDeps();
      const svc = createOrchestrationResumeService(deps);

      await svc.resume(42, { editedSteps });

      expect(deps.runStore.update).not.toHaveBeenCalled();
      expect(resumePlanFrom(deps)).toBe(originalPlan);
    }
  });
});
