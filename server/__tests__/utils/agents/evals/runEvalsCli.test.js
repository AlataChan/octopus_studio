"use strict";

/**
 * Tests for runEvalsCliMain — thin CLI entry for evals.
 * All tests use injected deps (no real fs/process/LLM).
 */

const { runEvalsCliMain } = require("../../../../utils/agents/evals/runEvalsCli");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid dataset JSON string.
 * All cases have static output + minimal passing heuristics (no mustContain etc.)
 */
function makeDatasetJson(cases) {
  return JSON.stringify(cases);
}

/** Capture log calls */
function makeLog() {
  const lines = [];
  return {
    fn: (...args) => lines.push(args.join(" ")),
    lines,
  };
}

// ---------------------------------------------------------------------------
// Fixture dataset — deterministic, all pass builtin scorers
// ---------------------------------------------------------------------------

const PASSING_DATASET = [
  { id: "c1", output: "hello world", expected: { shouldContain: ["hello"] } },
  { id: "c2", output: "the quick brown fox", expected: { shouldContain: ["quick"] } },
];

const FAILING_DATASET = [
  {
    id: "c1",
    output: "hello world",
    expected: { mustContain: ["MISSING_KEYWORD"] },
  },
];

// ---------------------------------------------------------------------------
// Basic argument parsing
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — argument parsing", () => {
  it("reads dataset file path from argv[2]", async () => {
    const datasetJson = makeDatasetJson(PASSING_DATASET);
    const readFile = async (path) => {
      expect(path).toBe("/fake/dataset.json");
      return datasetJson;
    };
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/fake/dataset.json"],
      readFile,
      log: log.fn,
    });

    // If readFile was called without error, we validated the path
    expect(log.lines.length).toBeGreaterThan(0);
  });

  it("exits with code 1 and logs error when no file path given", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js"],
      readFile: async () => "[]",
      log: log.fn,
    });

    expect(exitCode).toBe(1);
    expect(log.lines.some((l) => /usage|path|argument|file/i.test(l))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — dataset loading", () => {
  it("parses dataset JSON from readFile result", async () => {
    const datasetJson = makeDatasetJson(PASSING_DATASET);
    let parsedOk = false;

    const log = makeLog();
    const readFile = async () => datasetJson;

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/any/path.json"],
      readFile,
      log: log.fn,
    });

    // If it ran without throwing, JSON was parsed
    expect(exitCode).toBeDefined();
  });

  it("exits with code 1 and logs error when readFile rejects", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/no/such/file.json"],
      readFile: async () => { throw new Error("ENOENT"); },
      log: log.fn,
    });

    expect(exitCode).toBe(1);
    expect(log.lines.some((l) => /error|fail|ENOENT/i.test(l))).toBe(true);
  });

  it("exits with code 1 and logs error when file contains invalid JSON", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/bad.json"],
      readFile: async () => "not valid json {{{",
      log: log.fn,
    });

    expect(exitCode).toBe(1);
    expect(log.lines.some((l) => /json|parse|error/i.test(l))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Runs builtin scorers (deterministic, no llm_judge)
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — runs builtin scorers", () => {
  it("runs with default BUILTIN_SCORERS (no llm_judge)", async () => {
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
    });

    const output = log.lines.join("\n");
    // Should mention pass rate
    expect(/pass/i.test(output)).toBe(true);
  });

  it("accepts injected scorers override (for testing)", async () => {
    const log = makeLog();
    // Inject a trivial scorer that always passes
    const trivialScorer = {
      name: "trivial",
      score: () => ({ score: 1, passed: true, detail: "always pass" }),
    };

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
      scorers: [trivialScorer],
    });

    const output = log.lines.join("\n");
    expect(/trivial/i.test(output)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Summary output
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — summary output", () => {
  it("prints overallPassRate in summary", async () => {
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
    });

    const output = log.lines.join("\n");
    expect(/overall.*pass|pass.*rate/i.test(output)).toBe(true);
  });

  it("prints per-scorer stats in summary", async () => {
    const log = makeLog();
    const scorer = {
      name: "myScorer",
      score: () => ({ score: 0.8, passed: true, detail: "ok" }),
    };

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
      scorers: [scorer],
    });

    const output = log.lines.join("\n");
    expect(/myScorer/i.test(output)).toBe(true);
  });

  it("prints failed ids when there are failures", async () => {
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(FAILING_DATASET),
      log: log.fn,
    });

    const output = log.lines.join("\n");
    expect(/c1|fail/i.test(output)).toBe(true);
  });

  it("prints total case count", async () => {
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
    });

    const output = log.lines.join("\n");
    // 2 cases in dataset
    expect(/2/.test(output)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — exit codes", () => {
  it("returns exit code 0 by default even when there are failures", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(FAILING_DATASET),
      log: log.fn,
    });

    expect(exitCode).toBe(0);
  });

  it("returns exit code 0 when all cases pass", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
    });

    expect(exitCode).toBe(0);
  });

  it("returns exit code 1 when --strict flag is set AND there are failures", async () => {
    const log = makeLog();

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json", "--strict"],
      readFile: async () => makeDatasetJson(FAILING_DATASET),
      log: log.fn,
    });

    expect(exitCode).toBe(1);
  });

  it("returns exit code 0 when --strict flag is set but all cases pass", async () => {
    const log = makeLog();
    // Use a scorer that always passes so we can verify strict+pass → exit 0
    const alwaysPassScorer = {
      name: "alwaysPass",
      score: () => ({ score: 1, passed: true, detail: "ok" }),
    };

    const exitCode = await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json", "--strict"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
      scorers: [alwaysPassScorer],
    });

    expect(exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Metadata / timestamp
// ---------------------------------------------------------------------------
describe("runEvalsCliMain — metadata", () => {
  it("logs a timestamp in the summary", async () => {
    const log = makeLog();

    await runEvalsCliMain({
      argv: ["node", "runEvalsCli.js", "/dataset.json"],
      readFile: async () => makeDatasetJson(PASSING_DATASET),
      log: log.fn,
    });

    const output = log.lines.join("\n");
    // Timestamp is present (ISO date string or epoch number)
    expect(/\d{4}|\d{10,}/.test(output)).toBe(true);
  });
});
