function loadRunManager() {
  return require("../../../../utils/agents/coding/codingRunManager");
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (predicate()) return resolve();
        if (Date.now() - started > 1000) {
          return reject(new Error("condition not met"));
        }
        setTimeout(tick, 5);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}

function makeManager(overrides = {}) {
  const { CodingRunManager } = loadRunManager();
  return new CodingRunManager({
    now: () => 1000,
    allowlistResolver: () => ["/allowed"],
    sessionFactory: async () => ({
      workspace: {
        sourceRepoPath: "/allowed/repo",
        sandboxPath: "/tmp/sandbox",
        cleanup: jest.fn(),
        manifest: { files: {} },
      },
      runtime: {},
      finalizeRun: jest.fn(async () => ({
        patchArtifact: { text: "patch", changedFiles: 1 },
        finalAnswer: "done",
      })),
    }),
    modelFactory: () => ({ async *stream() {} }),
    ...overrides,
  });
}

describe("coding run manager M3 lifecycle", () => {
  test("T-RM1 createRun drives loop async to completed and records increasing events", async () => {
    const manager = makeManager({
      loopFactory: () => ({
        run: jest.fn(async () => ({
          status: "completed",
          turns: 2,
          finalText: "done",
          messages: [],
        })),
      }),
    });

    const created = await manager.createRun({
      sourceRepoPath: "/allowed/repo",
      prompt: "fix",
    });

    expect(created).toMatchObject({ status: "pending" });
    await waitFor(() => manager.getRun(created.runId)?.status === "completed");
    const snapshot = manager.getRun(created.runId);
    expect(snapshot).toMatchObject({
      runId: created.runId,
      status: "completed",
      totalTurns: 2,
    });
    const events = manager.listEvents(created.runId);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((event) => event.sequence).sort((left, right) => left - right)
    );
  });

  test("T-RM2 cancel aborts the run and late completions do not resurrect it", async () => {
    const gate = deferred();
    const manager = makeManager({
      loopFactory: ({ signal }) => ({
        run: jest.fn(async () => {
          await gate.promise;
          return signal.aborted
            ? { status: "cancelled", turns: 1, messages: [] }
            : { status: "completed", turns: 1, messages: [] };
        }),
      }),
    });

    const created = await manager.createRun({
      sourceRepoPath: "/allowed/repo",
      prompt: "fix",
    });
    await waitFor(() => manager.getRun(created.runId)?.status === "running");
    expect(manager.cancel(created.runId)).toMatchObject({ status: "cancelled" });
    gate.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getRun(created.runId).status).toBe("cancelled");
  });

  test("T-RM3 approve resumes awaiting run; unknown run or approval returns typed error", async () => {
    const manager = makeManager({
      loopFactory: () => ({
        run: jest.fn(async () => ({
          status: "awaiting_approval",
          turns: 1,
          pendingApproval: { approvalId: "approval-1" },
          messages: [],
        })),
        resume: jest.fn(async ({ approvalId, approved }) => ({
          status: "completed",
          turns: 2,
          finalText: `${approvalId}:${approved}`,
          messages: [],
        })),
      }),
    });
    const created = await manager.createRun({
      sourceRepoPath: "/allowed/repo",
      prompt: "fix",
    });
    await waitFor(() => manager.getRun(created.runId)?.status === "awaiting_approval");

    await expect(manager.approve("missing", { approvalId: "x", approved: true })).resolves.toMatchObject({
      ok: false,
      code: "run_not_found",
    });
    expect(await manager.approve(created.runId, { approvalId: "bad", approved: true })).toMatchObject({
      ok: false,
      code: "approval_not_found",
    });

    await expect(
      manager.approve(created.runId, { approvalId: "approval-1", approved: true })
    ).resolves.toMatchObject({ ok: true, status: "completed" });
    expect(manager.getRun(created.runId).status).toBe("completed");
  });

  test("T-RM4 getPatch and applyBack delegate to finalize and applyPatchBack; applyBack refuses without approval", async () => {
    const finalizeRun = jest.fn(async () => ({
      patchArtifact: { text: "patch" },
      finalAnswer: "done",
    }));
    const applyPatchBack = jest.fn(async () => ({ applied: true, status: "applied" }));
    const manager = makeManager({
      applyPatchBack,
      sessionFactory: async () => ({
        workspace: { sourceRepoPath: "/allowed/repo", cleanup: jest.fn(), manifest: { files: {} } },
        runtime: {},
        finalizeRun,
      }),
      loopFactory: () => ({
        run: jest.fn(async () => ({ status: "completed", turns: 1, messages: [] })),
      }),
    });
    const created = await manager.createRun({ sourceRepoPath: "/allowed/repo", prompt: "fix" });
    await waitFor(() => manager.getRun(created.runId)?.status === "completed");

    await expect(manager.getPatch(created.runId)).resolves.toEqual({ text: "patch" });
    await expect(manager.applyBack(created.runId, { approved: false })).resolves.toMatchObject({
      applied: false,
      status: "approval_required",
    });
    await expect(manager.applyBack(created.runId, { approved: true })).resolves.toMatchObject({
      applied: true,
      status: "applied",
    });
    expect(applyPatchBack).toHaveBeenCalledWith(
      expect.objectContaining({
        approval: { approved: true },
      })
    );
  });

  test("T-RM5 getRun snapshot is serializable; maxActiveRuns and event cap use a truncation marker", async () => {
    const manager = makeManager({
      maxActiveRuns: 1,
      eventLogCap: 2,
      loopFactory: () => ({
        run: jest.fn(async () => ({ status: "completed", turns: 1, messages: [] })),
      }),
    });
    const first = await manager.createRun({ sourceRepoPath: "/allowed/repo", prompt: "one" });
    expect(() => JSON.stringify(manager.getRun(first.runId))).not.toThrow();
    await expect(
      manager.createRun({ sourceRepoPath: "/allowed/other", prompt: "two" })
    ).rejects.toThrow(/active run limit/i);

    manager.recordEvent(first.runId, "coding.model.delta", { text: "a" });
    manager.recordEvent(first.runId, "coding.model.delta", { text: "b" });
    manager.recordEvent(first.runId, "coding.model.delta", { text: "c" });
    const events = manager.listEvents(first.runId);
    expect(events[0]).toMatchObject({
      type: "coding.events.truncated",
      payload: expect.objectContaining({ lastRetainedSequence: expect.any(Number) }),
    });
    expect(events.length).toBeLessThanOrEqual(3);
  });
});
