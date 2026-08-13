function loadRunManager() {
  return require("../../../../utils/agents/coding/codingRunManager");
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (predicate()) return resolve();
        if (Date.now() - started > 1000) return reject(new Error("condition not met"));
        setTimeout(tick, 5);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}

function makeRepository() {
  const runs = new Map();
  const events = new Map();
  const artifacts = new Map();
  return {
    runs,
    events,
    artifacts,
    saveRun: jest.fn(async (run) => {
      runs.set(run.runId, JSON.parse(JSON.stringify(run)));
      return runs.get(run.runId);
    }),
    updateRun: jest.fn(async (runId, patch) => {
      const existing = runs.get(runId) || { runId };
      runs.set(runId, { ...existing, ...JSON.parse(JSON.stringify(patch)) });
      return runs.get(runId);
    }),
    appendEvent: jest.fn(async (runId, type, payload) => {
      const list = events.get(runId) || [];
      const event = { sequence: list.length + 1, type, payload };
      list.push(event);
      events.set(runId, list);
      return event;
    }),
    saveArtifact: jest.fn(async (runId, artifact) => {
      const list = artifacts.get(runId) || [];
      list.push(JSON.parse(JSON.stringify(artifact)));
      artifacts.set(runId, list);
      return artifact;
    }),
    loadRun: jest.fn(async (runId) => runs.get(runId) || null),
    listEvents: jest.fn(async (runId) => events.get(runId) || []),
    listNonTerminalRuns: jest.fn(async () =>
      Array.from(runs.values()).filter((run) =>
        ["pending", "running", "awaiting_approval"].includes(run.status)
      )
    ),
  };
}

function makeManager(overrides = {}) {
  const { CodingRunManager } = loadRunManager();
  return new CodingRunManager({
    now: () => 1000,
    allowlistResolver: () => ["/allowed"],
    sessionFactory: async ({ runId }) => ({
      workspace: {
        sourceRepoPath: "/allowed/repo",
        sandboxPath: `/tmp/${runId}`,
        cleanup: jest.fn(),
        manifest: {
          sourceRepoPath: "/allowed/repo",
          sourceHead: "abc123",
          files: { "src/app.js": "hash-before" },
        },
      },
      runtime: {},
      finalizeRun: jest.fn(async () => ({
        patchArtifact: {
          text: "diff --git a/src/app.js b/src/app.js\n",
          changedFiles: 1,
          metadata: {},
        },
        finalAnswer: "done",
      })),
    }),
    modelFactory: () => ({ async *stream() {} }),
    loopFactory: () => ({
      run: jest.fn(async () => ({
        status: "completed",
        turns: 1,
        finalText: "done",
        messages: [],
      })),
    }),
    ...overrides,
  });
}

describe("coding run manager M4 persistence seam", () => {
  test("T-PS3 persists run, events, source manifest, and patch artifact; loadRun is read-only rehydration", async () => {
    const repository = makeRepository();
    const manager = makeManager({ repository });

    const created = await manager.createRun({
      sourceRepoPath: "/allowed/repo",
      prompt: "fix",
      provider: "deepseek",
      model: "deepseek-chat",
    });
    await waitFor(() => manager.getRun(created.runId)?.status === "completed");

    expect(repository.saveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: created.runId,
        status: "pending",
      })
    );
    expect(repository.updateRun).toHaveBeenCalledWith(
      created.runId,
      expect.objectContaining({
        metadata: expect.objectContaining({
          manifest: expect.objectContaining({ files: { "src/app.js": "hash-before" } }),
        }),
      })
    );
    expect(repository.updateRun).toHaveBeenCalledWith(
      created.runId,
      expect.objectContaining({ status: "completed" })
    );
    expect(repository.saveArtifact).toHaveBeenCalledWith(
      created.runId,
      expect.objectContaining({
        artifactType: "patch",
        metadata: expect.objectContaining({
          manifest: expect.objectContaining({ sourceHead: "abc123" }),
        }),
      })
    );

    const loaded = await manager.loadRun(created.runId);
    expect(loaded).toMatchObject({ runId: created.runId, status: "completed" });
    await expect(
      manager.approve(created.runId, { approvalId: "anything", approved: true })
    ).resolves.toMatchObject({ ok: false, code: "approval_not_found" });
  });

  test("T-PS4 in-memory repository remains the default for existing tests", () => {
    const manager = makeManager();
    expect(manager.repository).toBeDefined();
    expect(manager.repository.isMemoryRepository).toBe(true);
  });

  test("T-PS5 initialize marks persisted non-terminal runs failed runner_lost and approve/cancel return typed errors", async () => {
    const repository = makeRepository();
    repository.runs.set("run-lost", {
      runId: "run-lost",
      status: "awaiting_approval",
      provider: "deepseek",
      model: "deepseek-chat",
      totalTurns: 1,
      metadata: {},
    });
    const manager = makeManager({ repository });

    await manager.initialize();

    expect(repository.updateRun).toHaveBeenCalledWith(
      "run-lost",
      expect.objectContaining({
        status: "failed",
        errorCode: "runner_lost",
      })
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      "run-lost",
      "coding.run.failed",
      expect.objectContaining({ errorCode: "runner_lost" })
    );
    expect(await manager.loadRun("run-lost")).toMatchObject({
      runId: "run-lost",
      status: "failed",
      errorCode: "runner_lost",
    });
    await expect(
      manager.approve("run-lost", { approvalId: "approval-1", approved: true })
    ).resolves.toMatchObject({ ok: false, code: "runner_lost" });
    expect(manager.cancel("run-lost")).toMatchObject({ ok: false, code: "runner_lost" });
  });
});
