"use strict";

const {
  createOrchestrationResumeService,
  shouldResumeTeam,
} = require("../../../../utils/agents/orchestration/orchestrationResumeService");

// ── shouldResumeTeam gate ────────────────────────────────────────────────────

describe("shouldResumeTeam", () => {
  test("returns true for team_step planDetails (string JSON)", () => {
    expect(
      shouldResumeTeam({ planDetails: JSON.stringify({ kind: "team_step", orchestrationRunId: "r1" }) })
    ).toBe(true);
  });

  test("returns true for team_step planDetails (object)", () => {
    expect(
      shouldResumeTeam({ planDetails: { kind: "team_step" } })
    ).toBe(true);
  });

  test("returns false for non-team_step kind", () => {
    expect(
      shouldResumeTeam({ planDetails: JSON.stringify({ kind: "single_employee" }) })
    ).toBe(false);
  });

  test("returns false when planDetails is missing", () => {
    expect(shouldResumeTeam({ planDetails: null })).toBe(false);
  });

  test("returns false when confirmation is null", () => {
    expect(shouldResumeTeam(null)).toBe(false);
  });

  test("returns false for invalid JSON planDetails", () => {
    expect(shouldResumeTeam({ planDetails: "not-json{{{" })).toBe(false);
  });
});

// ── OrchestrationResumeService ───────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const fakeConf = {
    id: 42,
    workspaceId: "ws-1",
    userId: "u-1",
    threadId: "t-1",
    planDetails: JSON.stringify({
      kind: "team_step",
      orchestrationRunId: "run-abc",
      stepId: 2,
    }),
    status: "approved",
  };

  const fakeState = {
    plan: [
      { assistantId: "a-0", subtask: "step 0" },
      { assistantId: "a-1", subtask: "step 1" },
    ],
    cursor: 1,
    accumulatedContext: "context after step 0",
    status: "suspended",
    pendingConfirmationId: 42,
  };

  return {
    orchestrationService: {
      run: jest.fn().mockResolvedValue({ text: "报告完成", status: "done", steps: [], sources: [], artifacts: [], runId: "run-abc", error: null }),
    },
    runStore: {
      get: jest.fn().mockResolvedValue(fakeState),
    },
    getConfirmation: jest.fn().mockResolvedValue(fakeConf),
    loadWorkspace: jest.fn().mockResolvedValue({ id: "ws-1" }),
    loadUser: jest.fn().mockResolvedValue({ id: "u-1" }),
    loadThread: jest.fn().mockResolvedValue({ id: "t-1" }),
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

describe("resume — process-restart simulation (pure DB-state, no in-memory resolver)", () => {
  test("calls orchestrationService.run with correct resumeState from DB", async () => {
    const deps = makeDeps();
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(42);

    expect(result).toEqual({ handled: true, suspended: false, text: "报告完成" });

    // Verify resumeState reconstructed purely from DB
    const runCall = deps.orchestrationService.run.mock.calls[0][0];
    expect(runCall.resumeState).toEqual({
      runId: "run-abc",
      plan: [
        { assistantId: "a-0", subtask: "step 0" },
        { assistantId: "a-1", subtask: "step 1" },
      ],
      cursor: 1,
      accumulatedContext: "context after step 0",
    });

    // Verify persistResult called once
    expect(deps.persistResult).toHaveBeenCalledTimes(1);
    expect(deps.persistResult.mock.calls[0][0].result.text).toBe("报告完成");
  });

  test("runStore.get is called with orchestrationRunId from confirmation planDetails", async () => {
    const deps = makeDeps();
    const svc = createOrchestrationResumeService(deps);
    await svc.resume(42);
    expect(deps.runStore.get).toHaveBeenCalledWith("run-abc");
  });

  test("no in-memory resolver — loadWorkspace/loadUser/loadThread each called once from DB", async () => {
    const deps = makeDeps();
    const svc = createOrchestrationResumeService(deps);
    await svc.resume(42);
    expect(deps.loadWorkspace).toHaveBeenCalledWith("ws-1");
    expect(deps.loadUser).toHaveBeenCalledWith("u-1");
    expect(deps.loadThread).toHaveBeenCalledWith("t-1");
  });
});

describe("resume — non-team_step confirmation → skip (no run)", () => {
  test("returns handled:false with reason not_team_step", async () => {
    const deps = makeDeps({
      getConfirmation: jest.fn().mockResolvedValue({
        id: 10,
        workspaceId: "ws-1",
        planDetails: JSON.stringify({ kind: "single_employee" }),
      }),
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(10);

    expect(result).toEqual({ handled: false, reason: "not_team_step" });
    expect(deps.orchestrationService.run).not.toHaveBeenCalled();
    expect(deps.persistResult).not.toHaveBeenCalled();
  });
});

describe("resume — run returns suspended again", () => {
  test("returns handled:true, suspended:true; does NOT call persistResult", async () => {
    const deps = makeDeps({
      orchestrationService: {
        run: jest.fn().mockResolvedValue({
          text: null,
          status: "suspended",
          confirmationId: "c-99",
          steps: [],
          sources: [],
          artifacts: [],
          runId: "run-abc",
          error: null,
        }),
      },
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(42);

    expect(result).toEqual({ handled: true, suspended: true, confirmationId: "c-99" });
    expect(deps.persistResult).not.toHaveBeenCalled();
  });
});

describe("resume — missing confirmation", () => {
  test("returns handled:false when confirmation not found", async () => {
    const deps = makeDeps({
      getConfirmation: jest.fn().mockResolvedValue(null),
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(999);

    expect(result).toEqual({ handled: false, reason: "confirmation_not_found" });
    expect(deps.orchestrationService.run).not.toHaveBeenCalled();
  });
});

describe("resume — missing run state", () => {
  test("returns handled:false when runStore.get returns null", async () => {
    const deps = makeDeps({
      runStore: { get: jest.fn().mockResolvedValue(null) },
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(42);

    expect(result).toEqual({ handled: false, reason: "run_state_missing" });
    expect(deps.orchestrationService.run).not.toHaveBeenCalled();
  });

  test("returns handled:false when runStore.get returns state without plan", async () => {
    const deps = makeDeps({
      runStore: { get: jest.fn().mockResolvedValue({ cursor: 1, accumulatedContext: "" }) },
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(42);

    expect(result).toEqual({ handled: false, reason: "run_state_missing" });
  });

  test("calls runStore.finalize('failed') when runStore.get returns null and finalize exists", async () => {
    const finalizeMock = jest.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      runStore: {
        get: jest.fn().mockResolvedValue(null),
        finalize: finalizeMock,
      },
    });
    const svc = createOrchestrationResumeService(deps);
    await svc.resume(42);

    expect(finalizeMock).toHaveBeenCalledWith("run-abc", "failed");
  });

  test("does NOT call finalize when runStore has no finalize method", async () => {
    const deps = makeDeps({
      runStore: { get: jest.fn().mockResolvedValue(null) },
    });
    const svc = createOrchestrationResumeService(deps);
    // Should not throw
    const result = await svc.resume(42);
    expect(result).toEqual({ handled: false, reason: "run_state_missing" });
  });
});

describe("resume — orchestrationService.run throws", () => {
  test("returns {handled:false, error} when run() throws", async () => {
    const finalizeMock = jest.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      orchestrationService: {
        run: jest.fn().mockRejectedValue(new Error("model timeout")),
      },
      runStore: {
        get: jest.fn().mockResolvedValue({
          plan: [{ assistantId: "a-0", subtask: "step 0" }],
          cursor: 0,
          accumulatedContext: "",
          status: "suspended",
        }),
        finalize: finalizeMock,
      },
    });
    const svc = createOrchestrationResumeService(deps);
    const result = await svc.resume(42);

    expect(result.handled).toBe(false);
    expect(result.error).toBe("model timeout");
    expect(finalizeMock).toHaveBeenCalledWith("run-abc", "failed");
  });

  test("emits error event via onEvent when run() throws and buildOnEvent available", async () => {
    const onEventMock = jest.fn();
    const deps = makeDeps({
      orchestrationService: {
        run: jest.fn().mockRejectedValue(new Error("network error")),
      },
      runStore: {
        get: jest.fn().mockResolvedValue({
          plan: [{ assistantId: "a-0", subtask: "step 0" }],
          cursor: 0,
          accumulatedContext: "",
          status: "suspended",
        }),
        finalize: jest.fn().mockResolvedValue(undefined),
      },
      buildOnEvent: jest.fn().mockReturnValue(onEventMock),
    });
    const svc = createOrchestrationResumeService(deps);
    await svc.resume(42);

    expect(onEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", error: "network error", runId: "run-abc" })
    );
  });

  test("does NOT call persistResult when run() throws", async () => {
    const deps = makeDeps({
      orchestrationService: {
        run: jest.fn().mockRejectedValue(new Error("crash")),
      },
      runStore: {
        get: jest.fn().mockResolvedValue({
          plan: [{ assistantId: "a-0", subtask: "step 0" }],
          cursor: 0,
          accumulatedContext: "",
          status: "suspended",
        }),
        finalize: jest.fn().mockResolvedValue(undefined),
      },
    });
    const svc = createOrchestrationResumeService(deps);
    await svc.resume(42);

    expect(deps.persistResult).not.toHaveBeenCalled();
  });
});
