"use strict";

const { createOrchestrationResumeService } = require("../orchestrationResumeService");

describe("resume concurrent CAS compatibility", () => {
  it("keeps legacy metadata resume contract unchanged", async () => {
    const run = jest.fn().mockResolvedValue({ status: "done", text: "ok" });
    const deps = {
      orchestrationService: { run },
      runStore: {
        get: jest.fn().mockResolvedValue({
          plan: [{ assistantId: "a", subtask: "legacy" }],
          cursor: 0,
          accumulatedContext: "legacy ctx",
        }),
      },
      getConfirmation: jest.fn().mockResolvedValue({
        workspaceId: 1,
        userId: 2,
        threadId: 3,
        planDetails: JSON.stringify({
          kind: "team_step",
          orchestrationRunId: "run-1",
          stepId: 0,
        }),
      }),
      loadWorkspace: jest.fn().mockResolvedValue({ id: 1 }),
      loadUser: jest.fn().mockResolvedValue({ id: 2 }),
      loadThread: jest.fn().mockResolvedValue({ id: 3 }),
      listEmployees: jest.fn().mockResolvedValue([{ assistantId: "a" }]),
      buildGenerateText: jest.fn().mockReturnValue(jest.fn()),
      buildOnEvent: jest.fn().mockReturnValue(jest.fn()),
      persistResult: jest.fn(),
    };

    await createOrchestrationResumeService(deps).resume("c1");

    expect(run.mock.calls[0][0].resumeState).toEqual({
      runId: "run-1",
      plan: [{ assistantId: "a", subtask: "legacy" }],
      cursor: 0,
      accumulatedContext: "legacy ctx",
    });
  });

  it("uses CAS claim for v2 resumes so only one concurrent caller wins", async () => {
    let stateVersion = 0;
    const metadata = {
      executionVersion: 2,
      plan: [{ assistantId: "a", subtask: "v2" }],
      cursor: 0,
      accumulatedContext: "ctx",
      stepStates: [{ index: 0, status: "pending", planRevision: 1 }],
    };
    const run = jest.fn().mockResolvedValue({ status: "done", text: "ok" });
    const runStore = {
      get: jest.fn().mockResolvedValue({ stateVersion, metadata, ...metadata }),
      casUpdate: jest.fn().mockImplementation(async (_runId, expected, next) => {
        if (expected !== stateVersion) return { ok: false, conflict: true };
        stateVersion += 1;
        Object.assign(metadata, next);
        return { ok: true, stateVersion };
      }),
      finalize: jest.fn(),
    };
    const deps = {
      orchestrationService: { run },
      runStore,
      getConfirmation: jest.fn().mockResolvedValue({
        workspaceId: 1,
        userId: 2,
        threadId: 3,
        planDetails: JSON.stringify({
          kind: "team_step",
          orchestrationRunId: "run-v2",
          stepId: 0,
        }),
      }),
      loadWorkspace: jest.fn().mockResolvedValue({ id: 1 }),
      loadUser: jest.fn().mockResolvedValue({ id: 2 }),
      loadThread: jest.fn().mockResolvedValue({ id: 3 }),
      listEmployees: jest.fn().mockResolvedValue([{ assistantId: "a" }]),
      buildGenerateText: jest.fn().mockReturnValue(jest.fn()),
      buildOnEvent: jest.fn().mockReturnValue(jest.fn()),
      persistResult: jest.fn(),
    };
    const svc = createOrchestrationResumeService(deps);

    const [a, b] = await Promise.all([svc.resume("c1"), svc.resume("c1")]);

    expect([a.handled, b.handled].filter(Boolean)).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(runStore.casUpdate).toHaveBeenCalled();
  });

  it("clears the v2 resume claim when a resumed run suspends again", async () => {
    let stateVersion = 0;
    const metadata = {
      executionVersion: 2,
      plan: [{ assistantId: "a", subtask: "v2" }],
      cursor: 0,
      accumulatedContext: "ctx",
      stepStates: [
        {
          index: 0,
          status: "awaiting_approval",
          planRevision: 1,
          confirmationId: "c1",
        },
      ],
    };
    const run = jest.fn()
      .mockResolvedValueOnce({ status: "suspended", confirmationId: "c2" })
      .mockResolvedValueOnce({ status: "done", text: "ok" });
    const runStore = {
      get: jest.fn().mockImplementation(async () => ({
        stateVersion,
        metadata: JSON.parse(JSON.stringify(metadata)),
        ...JSON.parse(JSON.stringify(metadata)),
      })),
      casUpdate: jest.fn().mockImplementation(async (_runId, expected, next) => {
        if (expected !== stateVersion) return { ok: false, conflict: true };
        stateVersion += 1;
        Object.keys(metadata).forEach((key) => delete metadata[key]);
        Object.assign(metadata, JSON.parse(JSON.stringify(next)));
        return { ok: true, stateVersion };
      }),
      finalize: jest.fn(),
    };
    const deps = {
      orchestrationService: { run },
      runStore,
      getConfirmation: jest.fn().mockImplementation(async (confirmationId) => ({
        workspaceId: 1,
        userId: 2,
        threadId: 3,
        planDetails: JSON.stringify({
          kind: "team_step",
          orchestrationRunId: "run-v2",
          stepId: 0,
          confirmationId,
        }),
      })),
      loadWorkspace: jest.fn().mockResolvedValue({ id: 1 }),
      loadUser: jest.fn().mockResolvedValue({ id: 2 }),
      loadThread: jest.fn().mockResolvedValue({ id: 3 }),
      listEmployees: jest.fn().mockResolvedValue([{ assistantId: "a" }]),
      buildGenerateText: jest.fn().mockReturnValue(jest.fn()),
      buildOnEvent: jest.fn().mockReturnValue(jest.fn()),
      persistResult: jest.fn(),
    };
    const svc = createOrchestrationResumeService(deps);

    const first = await svc.resume("c1");
    const second = await svc.resume("c2");

    expect(first).toEqual({ handled: true, suspended: true, confirmationId: "c2" });
    expect(second.handled).toBe(true);
    expect(second.suspended).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(metadata.resumeClaimId).toBeUndefined();
  });

  it("clears the v2 resume claim when persisting the completed resumed run fails", async () => {
    let stateVersion = 0;
    const metadata = {
      executionVersion: 2,
      plan: [{ assistantId: "a", subtask: "v2" }],
      cursor: 0,
      accumulatedContext: "ctx",
      stepStates: [
        {
          index: 0,
          status: "awaiting_approval",
          planRevision: 1,
          confirmationId: "c1",
        },
      ],
    };
    const run = jest.fn().mockResolvedValue({ status: "done", text: "ok" });
    const runStore = {
      get: jest.fn().mockImplementation(async () => ({
        stateVersion,
        metadata: JSON.parse(JSON.stringify(metadata)),
        ...JSON.parse(JSON.stringify(metadata)),
      })),
      casUpdate: jest.fn().mockImplementation(async (_runId, expected, next) => {
        if (expected !== stateVersion) return { ok: false, conflict: true };
        stateVersion += 1;
        Object.keys(metadata).forEach((key) => delete metadata[key]);
        Object.assign(metadata, JSON.parse(JSON.stringify(next)));
        return { ok: true, stateVersion };
      }),
      finalize: jest.fn(),
    };
    const persistResult = jest.fn()
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockResolvedValueOnce(undefined);
    const deps = {
      orchestrationService: { run },
      runStore,
      getConfirmation: jest.fn().mockResolvedValue({
        workspaceId: 1,
        userId: 2,
        threadId: 3,
        planDetails: JSON.stringify({
          kind: "team_step",
          orchestrationRunId: "run-v2",
          stepId: 0,
        }),
      }),
      loadWorkspace: jest.fn().mockResolvedValue({ id: 1 }),
      loadUser: jest.fn().mockResolvedValue({ id: 2 }),
      loadThread: jest.fn().mockResolvedValue({ id: 3 }),
      listEmployees: jest.fn().mockResolvedValue([{ assistantId: "a" }]),
      buildGenerateText: jest.fn().mockReturnValue(jest.fn()),
      buildOnEvent: jest.fn().mockReturnValue(jest.fn()),
      persistResult,
    };
    const svc = createOrchestrationResumeService(deps);

    await expect(svc.resume("c1")).rejects.toThrow("persist failed");
    expect(metadata.resumeClaimId).toBeUndefined();

    const second = await svc.resume("c1");

    expect(second).toEqual({ handled: true, suspended: false, text: "ok" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(persistResult).toHaveBeenCalledTimes(2);
    expect(metadata.resumeClaimId).toBeUndefined();
  });
});
