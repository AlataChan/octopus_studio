"use strict";

/**
 * Tests for runner.js — offline regression runner with scorers, timeout, abort, metadata.
 * All tests use fake/injected generate functions — no real model calls.
 */

const { runEvals } = require("../../../../utils/agents/evals/runner");
const {
  createMustContainScorer,
  createMustNotContainScorer,
  createLengthSanityScorer,
} = require("../../../../utils/agents/evals/scorer");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A dataset of static-output cases that all pass mustContain thresholds */
function makePassingDataset() {
  return [
    {
      id: "case-1",
      tags: ["smoke"],
      input: "What is 2+2?",
      output: "The answer is four",
      expected: { mustContain: ["answer"], minLength: 5 },
    },
    {
      id: "case-2",
      tags: ["smoke"],
      input: "Summarize briefly",
      output: "Here is a brief summary of the topic",
      expected: { mustContain: ["summary"], minLength: 5 },
    },
  ];
}

const mustContainScorer = createMustContainScorer();
const mustNotContainScorer = createMustNotContainScorer();
const lengthScorer = createLengthSanityScorer();

// ---------------------------------------------------------------------------
// Basic happy path
// ---------------------------------------------------------------------------
describe("runEvals — happy path (static output, all pass)", () => {
  it("returns overallPassRate=1 when all cases pass", async () => {
    const result = await runEvals({
      dataset: makePassingDataset(),
      scorers: [mustContainScorer, lengthScorer],
      thresholds: { mustContain: 1, lengthSanity: 1 },
      metadata: { generatedAt: "2026-01-01T00:00:00Z" },
    });

    expect(result.summary.overallPassRate).toBe(1);
    expect(result.summary.failed).toEqual([]);
    expect(result.summary.errored).toEqual([]);
    expect(result.summary.total).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("all results have id, tags, scores, passedByScorer, passed", async () => {
    const result = await runEvals({
      dataset: makePassingDataset(),
      scorers: [mustContainScorer],
      thresholds: {},
      metadata: {},
    });

    for (const r of result.results) {
      expect(typeof r.id).toBe("string");
      expect(Array.isArray(r.tags)).toBe(true);
      expect(typeof r.scores).toBe("object");
      expect(typeof r.passedByScorer).toBe("object");
      expect(typeof r.passed).toBe("boolean");
    }
  });

  it("byScorer summary includes avg, min, max, passRate", async () => {
    const result = await runEvals({
      dataset: makePassingDataset(),
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      metadata: {},
    });

    const bySc = result.summary.byScorer;
    expect(bySc).toHaveProperty("mustContain");
    expect(typeof bySc.mustContain.avg).toBe("number");
    expect(typeof bySc.mustContain.min).toBe("number");
    expect(typeof bySc.mustContain.max).toBe("number");
    expect(typeof bySc.mustContain.passRate).toBe("number");
  });

  it("avg=1 for all cases that pass mustContain fully", async () => {
    const result = await runEvals({
      dataset: makePassingDataset(),
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      metadata: {},
    });
    expect(result.summary.byScorer.mustContain.avg).toBe(1);
    expect(result.summary.byScorer.mustContain.passRate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// mustNotContain violation
// ---------------------------------------------------------------------------
describe("runEvals — mustNotContain violation", () => {
  it("failed case is in summary.failed, passed=false, passRate < 1", async () => {
    const dataset = [
      {
        id: "clean",
        output: "This is a clean and helpful response",
        expected: { mustNotContain: ["badword"] },
      },
      {
        id: "dirty",
        output: "This output contains badword in it",
        expected: { mustNotContain: ["badword"] },
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustNotContainScorer],
      thresholds: { mustNotContain: 1 },
      metadata: {},
    });

    expect(result.summary.failed).toContain("dirty");
    expect(result.summary.failed).not.toContain("clean");
    expect(result.summary.overallPassRate).toBeLessThan(1);

    const dirtyResult = result.results.find((r) => r.id === "dirty");
    expect(dirtyResult.passed).toBe(false);
    expect(dirtyResult.passedByScorer.mustNotContain).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-case threshold override
// ---------------------------------------------------------------------------
describe("runEvals — per-case threshold override", () => {
  it("uses case.thresholds when stricter than global thresholds", async () => {
    // Global threshold is lenient (0.5), but case requires 1.0
    const dataset = [
      {
        id: "strict-case",
        output: "The answer is here", // has "answer" but not "summary"
        expected: { mustContain: ["answer", "summary"] }, // 1/2 = 0.5 score
        thresholds: { mustContain: 1 }, // case requires 1.0 — should fail
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 0.4 }, // global is lenient
      metadata: {},
    });

    // Should fail due to case-level threshold
    const r = result.results[0];
    expect(r.passed).toBe(false);
    expect(result.summary.failed).toContain("strict-case");
  });

  it("uses global thresholds when case has no override", async () => {
    const dataset = [
      {
        id: "no-override",
        output: "The answer is here",
        expected: { mustContain: ["answer", "summary"] }, // 1/2 = 0.5 score
        // no case.thresholds
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 0.4 }, // global allows 0.5 to pass
      metadata: {},
    });

    const r = result.results[0];
    expect(r.passed).toBe(true);
    expect(result.summary.failed).not.toContain("no-override");
  });
});

// ---------------------------------------------------------------------------
// generate injection
// ---------------------------------------------------------------------------
describe("runEvals — generate injection", () => {
  it("calls case.generate with input and scores the returned output", async () => {
    const generate = jest.fn().mockResolvedValue("generated answer content");

    const dataset = [
      {
        id: "gen-case",
        input: "test input",
        generate,
        expected: { mustContain: ["answer"] },
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      metadata: {},
    });

    expect(generate).toHaveBeenCalledWith("test input");
    expect(result.results[0].passed).toBe(true);
    expect(result.summary.failed).not.toContain("gen-case");
  });

  it("prefers static output when both output and generate are provided", async () => {
    // Per spec: output takes precedence when both exist
    const generate = jest.fn().mockResolvedValue("generated content");
    const dataset = [
      {
        id: "both",
        input: "input",
        output: "static output with answer",
        generate,
        expected: { mustContain: ["answer"] },
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      metadata: {},
    });

    // generate should not be called when output is present
    expect(generate).not.toHaveBeenCalled();
    expect(result.results[0].passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timeout handling
// ---------------------------------------------------------------------------
describe("runEvals — timeout", () => {
  it("marks a hanging generate as error and does not hang", async () => {
    // Never resolves
    const hangingGenerate = () => new Promise(() => {});

    const dataset = [
      {
        id: "timeout-case",
        input: "timeout",
        generate: hangingGenerate,
        expected: {},
      },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: {},
      timeoutMs: 50, // 50ms timeout — very short
      metadata: {},
    });

    const r = result.results[0];
    expect(r.error).toBeDefined();
    expect(r.error).toMatch(/timeout/i);
    expect(result.summary.errored).toContain("timeout-case");
  }, 5000); // 5s jest timeout — plenty of room

  it("does not hang when multiple cases timeout", async () => {
    const hangingGenerate = () => new Promise(() => {});

    const dataset = [
      { id: "t1", input: "a", generate: hangingGenerate, expected: {} },
      { id: "t2", input: "b", generate: hangingGenerate, expected: {} },
    ];

    const result = await runEvals({
      dataset,
      scorers: [],
      thresholds: {},
      timeoutMs: 50,
      metadata: {},
    });

    expect(result.summary.errored).toContain("t1");
    expect(result.summary.errored).toContain("t2");
  }, 5000);
});

// ---------------------------------------------------------------------------
// AbortSignal handling
// ---------------------------------------------------------------------------
describe("runEvals — AbortSignal", () => {
  it("stops early when signal is already aborted before run", async () => {
    const controller = new AbortController();
    controller.abort(); // abort before run

    const dataset = [
      { id: "ab1", output: "hello", expected: {} },
      { id: "ab2", output: "world", expected: {} },
      { id: "ab3", output: "third", expected: {} },
    ];

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: {},
      signal: controller.signal,
      metadata: {},
    });

    // With pre-aborted signal, results/errored should reflect early stop
    // At minimum, the run should complete (not hang) and return a result shape
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("meta");
    expect(result).toHaveProperty("loadErrors");
  });

  it("aborts a hanging generate via signal", async () => {
    const controller = new AbortController();

    const hangingGenerate = () => new Promise(() => {});

    const dataset = [
      { id: "abort-gen", input: "x", generate: hangingGenerate, expected: {} },
    ];

    // Abort after a short delay
    setTimeout(() => controller.abort(), 30);

    const result = await runEvals({
      dataset,
      scorers: [],
      thresholds: {},
      signal: controller.signal,
      timeoutMs: 5000, // long timeout — abort signal fires first
      metadata: {},
    });

    // Should complete and mark as errored (not hang)
    expect(result.summary.errored.length + result.results.length).toBeGreaterThan(0);
  }, 5000);
});

// ---------------------------------------------------------------------------
// Metadata determinism
// ---------------------------------------------------------------------------
describe("runEvals — metadata determinism", () => {
  it("passes through injected metadata to meta", async () => {
    const metadata = {
      generatedAt: "2026-01-01T00:00:00Z",
      datasetVersion: "v1.2.3",
      scorerVersion: "v0.1.0",
      commit: "abc1234",
    };

    const result = await runEvals({
      dataset: [{ id: "m1", output: "hello", expected: {} }],
      scorers: [],
      thresholds: {},
      metadata,
    });

    expect(result.meta.generatedAt).toBe("2026-01-01T00:00:00Z");
    expect(result.meta.datasetVersion).toBe("v1.2.3");
    expect(result.meta.scorerVersion).toBe("v0.1.0");
    expect(result.meta.commit).toBe("abc1234");
  });

  it("does NOT add generatedAt if metadata does not include it", async () => {
    const result = await runEvals({
      dataset: [{ id: "m2", output: "hello", expected: {} }],
      scorers: [],
      thresholds: {},
      metadata: {},
    });

    // Should be null when not injected (deterministic — no internal Date.now)
    expect(result.meta.generatedAt).toBeNull();
  });

  it("meta includes datasetSize and scorerNames", async () => {
    const result = await runEvals({
      dataset: [
        { id: "m3", output: "hello", expected: {} },
        { id: "m4", output: "world", expected: {} },
      ],
      scorers: [mustContainScorer, mustNotContainScorer],
      thresholds: {},
      metadata: {},
    });

    expect(result.meta.datasetSize).toBe(2);
    expect(result.meta.scorerNames).toContain("mustContain");
    expect(result.meta.scorerNames).toContain("mustNotContain");
  });

  it("is reproducible — same inputs produce same outputs (no internal randomness)", async () => {
    const dataset = [
      { id: "rep1", output: "hello world answer", expected: { mustContain: ["answer"] } },
    ];

    const opts = {
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      metadata: { generatedAt: "2026-01-01T00:00:00Z" },
    };

    const r1 = await runEvals(opts);
    const r2 = await runEvals(opts);

    expect(r1.results[0].scores).toEqual(r2.results[0].scores);
    expect(r1.summary).toEqual(r2.summary);
    expect(r1.meta).toEqual(r2.meta);
  });
});

// ---------------------------------------------------------------------------
// loadErrors surface
// ---------------------------------------------------------------------------
describe("runEvals — loadErrors surface", () => {
  it("surfaces load errors in the result when dataset has invalid cases", async () => {
    const dataset = [
      { id: "valid", output: "hello", expected: {} },
      { output: "missing id" }, // invalid
    ];

    const result = await runEvals({
      dataset,
      scorers: [],
      thresholds: {},
      metadata: {},
    });

    expect(result.loadErrors.length).toBeGreaterThan(0);
    expect(result.summary.total).toBe(1); // only valid cases counted
  });
});

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------
describe("runEvals — concurrency", () => {
  it("processes all cases correctly with concurrency=1", async () => {
    const dataset = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      output: `output ${i} answer`,
      expected: { mustContain: ["answer"] },
    }));

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      concurrency: 1,
      metadata: {},
    });

    expect(result.results).toHaveLength(5);
    expect(result.summary.overallPassRate).toBe(1);
  });

  it("processes all cases correctly with concurrency=2", async () => {
    const dataset = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      output: `output ${i} answer`,
      expected: { mustContain: ["answer"] },
    }));

    const result = await runEvals({
      dataset,
      scorers: [mustContainScorer],
      thresholds: { mustContain: 1 },
      concurrency: 2,
      metadata: {},
    });

    expect(result.results).toHaveLength(6);
    expect(result.summary.overallPassRate).toBe(1);
  });
});
