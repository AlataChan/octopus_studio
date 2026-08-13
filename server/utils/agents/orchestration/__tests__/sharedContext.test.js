"use strict";

const {
  sanitizeEntries,
  snapshotContext,
  mergeDeltas,
  commitStep,
  LIMITS,
} = require("../sharedContext");

describe("sharedContext", () => {
  it("sanitizes read and write paths with null-prototype storage", () => {
    const dirty = JSON.parse(
      '{"ok":"value","__proto__":"pollute","constructor":"bad","hasOwnProperty":"bad","nested":{"x":1},"n":2}'
    );

    const sanitized = sanitizeEntries(dirty);

    expect(Object.getPrototypeOf(sanitized)).toBe(null);
    expect(sanitized).toEqual({ ok: "value" });
    expect({}.polluted).toBeUndefined();
  });

  it("strips polluted legacy metadata on snapshot", () => {
    const metadata = {
      sharedContext: JSON.parse(
        '{"safe_key-1":"kept","a\\n__proto__":"bad","prototype":"bad"}'
      ),
    };

    const snapshot = snapshotContext(metadata);

    expect(Object.getPrototypeOf(snapshot)).toBe(null);
    expect(snapshot).toEqual({ "safe_key-1": "kept" });
    expect({}.polluted).toBeUndefined();
  });

  it("enforces UTF-8 byte limits and string-only values", () => {
    const exact = "你".repeat(Math.floor(LIMITS.PER_KEY_BYTES / 3));
    const tooLarge = exact + "你";

    const sanitized = sanitizeEntries({
      exact,
      tooLarge,
      objectValue: { nope: true },
    });

    expect(sanitized.exact).toBe(exact);
    expect(sanitized.tooLarge).toBeUndefined();
    expect(sanitized.objectValue).toBeUndefined();
  });

  it("merges deltas deterministically by plan index", () => {
    const snapshot = sanitizeEntries({ shared: "base", keep: "yes" });
    const merged = mergeDeltas(snapshot, [
      { index: 2, delta: { shared: "late", b: "2" } },
      { index: 1, delta: { shared: "early", a: "1" } },
    ]);

    expect(merged).toEqual({
      shared: "late",
      keep: "yes",
      a: "1",
      b: "2",
    });
  });

  it("commits step state and context in one CAS update", async () => {
    const casUpdate = jest.fn().mockResolvedValue({ ok: true, stateVersion: 8 });
    const get = jest.fn().mockResolvedValue({
      stateVersion: 7,
      metadata: {
        executionVersion: 2,
        plan: [{ assistantId: "a", subtask: "t" }],
        stepStates: [{ index: 0, status: "running", readOnly: true }],
        sharedContext: { old: "value" },
      },
    });

    const result = await commitStep({
      runStore: { get, casUpdate },
      runId: "run-1",
      expectedStateVersion: 7,
      stepUpdates: [{ index: 0, patch: { status: "done", resultRef: "r0" } }],
      contextDeltas: [{ index: 0, delta: { next: "value" } }],
    });

    expect(result.ok).toBe(true);
    expect(casUpdate).toHaveBeenCalledTimes(1);
    const [, expectedVersion, patch] = casUpdate.mock.calls[0];
    expect(expectedVersion).toBe(7);
    expect(patch.stepStates[0]).toMatchObject({
      index: 0,
      status: "done",
      resultRef: "r0",
    });
    expect(patch.sharedContext).toEqual({ old: "value", next: "value" });
    expect(patch.cursor).toBe(1);
  });
});
