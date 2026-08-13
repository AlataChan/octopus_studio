"use strict";

/**
 * Tests for createLlmScorer — LLM-judge scorer hook.
 * All tests are pure/deterministic — uses injected fake judgeFn, no real model.
 */

const { createLlmScorer } = require("../../../../utils/agents/evals/llmScorer");

// ---------------------------------------------------------------------------
// createLlmScorer — basic interface
// ---------------------------------------------------------------------------
describe("createLlmScorer", () => {
  it("has default name 'llm_judge'", () => {
    const scorer = createLlmScorer({ judgeFn: async () => ({ score: 1 }) });
    expect(scorer.name).toBe("llm_judge");
  });

  it("accepts a custom name", () => {
    const scorer = createLlmScorer({
      name: "my_judge",
      judgeFn: async () => ({ score: 1 }),
    });
    expect(scorer.name).toBe("my_judge");
  });

  it("has a score function", () => {
    const scorer = createLlmScorer({ judgeFn: async () => ({ score: 1 }) });
    expect(typeof scorer.score).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// createLlmScorer — score() delegation to judgeFn
// ---------------------------------------------------------------------------
describe("createLlmScorer score()", () => {
  it("passes {input, output, expected} to judgeFn", async () => {
    const calls = [];
    const judgeFn = async (args) => {
      calls.push(args);
      return { score: 0.9 };
    };
    const scorer = createLlmScorer({ judgeFn });

    await scorer.score({
      input: "What is 2+2?",
      output: "4",
      expected: { shouldContain: ["4"] },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      input: "What is 2+2?",
      output: "4",
      expected: { shouldContain: ["4"] },
    });
  });

  it("returns normalized score from judgeFn", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 0.75, passed: true, detail: "good" }),
    });

    const result = await scorer.score({ input: "q", output: "a", expected: {} });

    expect(result.score).toBeCloseTo(0.75);
    expect(result.passed).toBe(true);
    expect(result.detail).toBe("good");
  });

  it("infers passed from score (>= 0.5 → passed) when judgeFn omits passed", async () => {
    const scorerPass = createLlmScorer({
      judgeFn: async () => ({ score: 0.8 }),
    });
    const scorerFail = createLlmScorer({
      judgeFn: async () => ({ score: 0.3 }),
    });

    const resultPass = await scorerPass.score({ output: "x" });
    const resultFail = await scorerFail.score({ output: "x" });

    expect(resultPass.passed).toBe(true);
    expect(resultFail.passed).toBe(false);
  });

  it("provides a default detail string when judgeFn omits detail", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 0.6 }),
    });

    const result = await scorer.score({ output: "x" });

    expect(typeof result.detail).toBe("string");
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it("clamps score above 1 to 1", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 1.5 }),
    });

    const result = await scorer.score({ output: "x" });

    expect(result.score).toBe(1);
  });

  it("clamps score below 0 to 0", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: -0.2 }),
    });

    const result = await scorer.score({ output: "x" });

    expect(result.score).toBe(0);
  });

  it("is async — score() returns a Promise", () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 1 }),
    });
    const result = scorer.score({ output: "x" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("propagates judgeFn errors as rejected promise", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => {
        throw new Error("model unavailable");
      },
    });

    await expect(scorer.score({ output: "x" })).rejects.toThrow("model unavailable");
  });

  it("works with score exactly 0", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 0, passed: false, detail: "completely wrong" }),
    });

    const result = await scorer.score({ output: "x" });

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("works with score exactly 1", async () => {
    const scorer = createLlmScorer({
      judgeFn: async () => ({ score: 1, passed: true, detail: "perfect" }),
    });

    const result = await scorer.score({ output: "x" });

    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });
});
