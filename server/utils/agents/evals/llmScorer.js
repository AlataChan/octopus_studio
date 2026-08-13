"use strict";

/**
 * llmScorer.js — LLM-judge scorer hook for the evals pipeline.
 *
 * Provides `createLlmScorer({ name?, judgeFn })` — a scorer whose score() method
 * delegates to an INJECTED `judgeFn` rather than any built-in heuristic.
 *
 * The LLM boundary is the judgeFn itself. The factory does NOT call any model;
 * callers inject a real judge (or a fake one for testing).
 *
 * Scorer interface (same as other scorers):
 *   { name: string, score({ input, output, expected, context }) => Promise<{ score: 0..1, passed: boolean, detail: string }> }
 *
 * judgeFn signature:
 *   ({ input, output, expected }) => Promise<{ score: number, passed?: boolean, detail?: string }>
 *
 * Normalization applied to judgeFn result:
 *   - score is clamped to [0, 1]
 *   - passed defaults to score >= 0.5 when omitted
 *   - detail defaults to "llm_judge score: <score>" when omitted
 *
 * NOTE: llm_judge is NOT included in BUILTIN_SCORERS (deterministic heuristics only).
 * The CLI and runner skip it by default. Callers must inject it explicitly.
 */

/**
 * Creates an LLM-judge scorer.
 *
 * @param {Object} opts
 * @param {string} [opts.name="llm_judge"] - Scorer name
 * @param {(args: {input?: string, output: string, expected?: object}) => Promise<{score: number, passed?: boolean, detail?: string}>} opts.judgeFn
 *   - Async function that evaluates a sample and returns a raw judgment.
 *     The LLM call (or any other evaluation logic) lives entirely inside judgeFn.
 *
 * @returns {{ name: string, score: Function }}
 */
function createLlmScorer({ name = "llm_judge", judgeFn } = {}) {
  if (typeof judgeFn !== "function") {
    throw new TypeError("createLlmScorer: judgeFn must be a function");
  }

  return {
    name,

    /**
     * Evaluate a sample by delegating to the injected judgeFn.
     *
     * @param {{ input?: string, output: string, expected?: object, context?: any }} sample
     * @returns {Promise<{ score: number, passed: boolean, detail: string }>}
     */
    async score({ input, output, expected, context } = {}) {
      // Delegate to judgeFn — may throw (propagated to caller)
      const raw = await judgeFn({ input, output, expected, context });

      // Clamp score to [0, 1]
      const rawScore = typeof raw.score === "number" ? raw.score : 0;
      const score = Math.max(0, Math.min(1, rawScore));

      // Default passed: score >= 0.5 when not explicitly provided
      const passed = raw.passed !== undefined ? Boolean(raw.passed) : score >= 0.5;

      // Default detail
      const detail =
        raw.detail !== undefined && raw.detail !== null
          ? String(raw.detail)
          : `llm_judge score: ${score}`;

      return { score, passed, detail };
    },
  };
}

module.exports = { createLlmScorer };
