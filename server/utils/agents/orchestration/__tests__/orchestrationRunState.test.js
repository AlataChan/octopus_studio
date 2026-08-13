"use strict";

const {
  deriveCursor,
  createInitialStepStates,
  reconcileStale,
  rebuildOnEdit,
  claimStep,
  commitWithRebase,
} = require("../orchestrationRunState");

function memoryRun(metadata) {
  let stateVersion = 0;
  let current = JSON.parse(JSON.stringify(metadata));
  return {
    async get() {
      return { stateVersion, metadata: JSON.parse(JSON.stringify(current)) };
    },
    async casUpdate(_runId, expected, nextMetadata) {
      if (expected !== stateVersion) return { ok: false, conflict: true };
      stateVersion += 1;
      current = JSON.parse(JSON.stringify(nextMetadata));
      return { ok: true, stateVersion };
    },
    snapshot() {
      return { stateVersion, metadata: current };
    },
  };
}

describe("orchestrationRunState", () => {
  it("derives cursor from stepStates and treats done/skipped as complete", () => {
    expect(deriveCursor([])).toBe(0);
    expect(deriveCursor([{ index: 0, status: "pending" }])).toBe(0);
    expect(
      deriveCursor([
        { index: 0, status: "done" },
        { index: 1, status: "skipped" },
        { index: 2, status: "failed" },
      ])
    ).toBe(2);
    expect(
      deriveCursor([
        { index: 0, status: "done" },
        { index: 1, status: "skipped" },
      ])
    ).toBe(2);
  });

  it("claims pending steps with CAS and is idempotent for the same attempt", async () => {
    const store = memoryRun({
      plan: [{ assistantId: "a", subtask: "t" }],
      stepStates: createInitialStepStates([{ assistantId: "a", subtask: "t" }]),
    });

    const first = await claimStep({
      runStore: store,
      runId: "run-1",
      index: 0,
      attemptId: "attempt-1",
      leaseMs: 1000,
      now: 100,
    });
    const second = await claimStep({
      runStore: store,
      runId: "run-1",
      index: 0,
      attemptId: "attempt-1",
      leaseMs: 1000,
      now: 200,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.alreadyClaimed).toBe(true);
    expect(store.snapshot().metadata.stepStates[0]).toMatchObject({
      status: "running",
      attemptId: "attempt-1",
      leaseUntil: 1100,
      attempts: 1,
    });
  });

  it("rebases and retries CAS conflicts instead of dropping updates", async () => {
    const store = memoryRun({
      plan: [
        { assistantId: "a", subtask: "one" },
        { assistantId: "b", subtask: "two" },
      ],
      stepStates: createInitialStepStates([
        { assistantId: "a", subtask: "one" },
        { assistantId: "b", subtask: "two" },
      ]),
      sharedContext: {},
    });

    await Promise.all([
      commitWithRebase({
        runStore: store,
        runId: "run-1",
        mutate: (metadata) => {
          metadata.stepStates[0].status = "done";
          metadata.sharedContext.a = "1";
          return metadata;
        },
      }),
      commitWithRebase({
        runStore: store,
        runId: "run-1",
        mutate: (metadata) => {
          metadata.stepStates[1].status = "done";
          metadata.sharedContext.b = "2";
          return metadata;
        },
      }),
    ]);

    expect(store.snapshot().metadata.stepStates.map((s) => s.status)).toEqual([
      "done",
      "done",
    ]);
    expect(store.snapshot().metadata.sharedContext).toEqual({ a: "1", b: "2" });
  });

  it("reconciles stale running steps by read-only risk", () => {
    const states = [
      { index: 0, status: "running", leaseUntil: 100, readOnly: true },
      { index: 1, status: "running", leaseUntil: 100, readOnly: false },
      { index: 2, status: "running", leaseUntil: 500, readOnly: true },
    ];

    const next = reconcileStale(states, 200);

    expect(next[0].status).toBe("pending");
    expect(next[0].attemptId).toBe(null);
    expect(next[1].status).toBe("needs_reconciliation");
    expect(next[2].status).toBe("running");
  });

  it("rebuilds edited plans by preserving only identical done/skipped prefixes", () => {
    const oldMetadata = {
      planRevision: 1,
      plan: [
        { assistantId: "a", subtask: "same" },
        { assistantId: "b", subtask: "changed" },
        { assistantId: "c", subtask: "old" },
      ],
      stepStates: [
        { index: 0, planRevision: 1, status: "done", resultRef: "keep" },
        { index: 1, planRevision: 1, status: "done", resultRef: "drop" },
        { index: 2, planRevision: 1, status: "pending" },
      ],
    };

    const rebuilt = rebuildOnEdit(oldMetadata, [
      { assistantId: "a", subtask: "same" },
      { assistantId: "b", subtask: "new" },
    ]);

    expect(rebuilt.planRevision).toBe(2);
    expect(rebuilt.stepStates[0]).toMatchObject({
      status: "done",
      resultRef: "keep",
    });
    expect(rebuilt.stepStates[1]).toMatchObject({
      status: "pending",
      planRevision: 2,
    });
    expect(rebuilt.previousStepStates).toEqual(oldMetadata.stepStates);
    expect(rebuilt.cursor).toBe(1);
  });
});
