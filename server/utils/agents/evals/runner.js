"use strict";

/**
 * runner.js — Offline regression runner for eval datasets.
 *
 * Runs scorers over a dataset of eval cases, aggregates results, and returns a
 * structured report. Supports:
 *   - Static output or injected generate() functions per case
 *   - Per-case timeout via AbortSignal + Promise.race
 *   - Global AbortSignal for early cancellation
 *   - Concurrency-limited batching (never more than `concurrency` concurrent generates)
 *   - Deterministic metadata (no internal Date.now() or Math.random())
 *   - Per-case threshold overrides on top of global thresholds
 *
 * DETERMINISM GUARANTEE: This module NEVER calls Date.now() or Math.random() internally.
 * Timestamps and versions are injected via the `metadata` argument.
 *
 * @module runner
 */

const { loadDataset } = require("./datasetLoader");
const { runScorers } = require("./scorer");

// ---------------------------------------------------------------------------
// Internal: wrap a generate call with timeout + AbortSignal
// ---------------------------------------------------------------------------

/**
 * Runs generate(input) with a per-call timeout and optional abort signal.
 * Returns { output: string } on success or { error: string } on timeout/abort/throw.
 *
 * @param {Function} generate
 * @param {any} input
 * @param {number} timeoutMs
 * @param {AbortSignal|null} signal
 * @returns {Promise<{ output?: string, error?: string }>}
 */
async function runGenerateWithGuard(generate, input, timeoutMs, signal) {
  // If signal is already aborted, fail immediately
  if (signal && signal.aborted) {
    return { error: "aborted: signal was already aborted before generate" };
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    // Timeout
    const timer = setTimeout(() => {
      settle({ error: `timeout: generate did not resolve within ${timeoutMs}ms` });
    }, timeoutMs);

    // AbortSignal handler
    const onAbort = () => {
      settle({ error: "aborted: operation was cancelled via AbortSignal" });
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // Actual generate call
    Promise.resolve()
      .then(() => generate(input))
      .then((output) => settle({ output }))
      .catch((err) => settle({ error: `generate threw: ${err && err.message ? err.message : String(err)}` }));
  });
}

// ---------------------------------------------------------------------------
// Internal: process a single eval case
// ---------------------------------------------------------------------------

/**
 * @param {Object} evalCase - Normalized eval case from loadDataset
 * @param {Array} scorers
 * @param {Object} globalThresholds - { [scorerName]: number }
 * @param {number} timeoutMs
 * @param {AbortSignal|null} signal
 * @returns {Promise<Object>} result record
 */
async function processCase(evalCase, scorers, globalThresholds, timeoutMs, signal) {
  const { id, tags, input, expected, output: staticOutput, generate, thresholds: caseThresholds } = evalCase;

  // Merged thresholds: case overrides global
  const effectiveThresholds = { ...globalThresholds, ...caseThresholds };

  // Resolve output
  let output;
  let errorMsg;

  if (staticOutput !== undefined) {
    // Static output takes precedence
    output = String(staticOutput);
  } else if (typeof generate === "function") {
    const guard = await runGenerateWithGuard(generate, input, timeoutMs, signal);
    if (guard.error) {
      errorMsg = guard.error;
    } else {
      output = String(guard.output);
    }
  } else {
    errorMsg = "no output or generate available";
  }

  // If errored, return early
  if (errorMsg) {
    return {
      id,
      tags: tags || [],
      scores: {},
      passedByScorer: {},
      passed: false,
      error: errorMsg,
    };
  }

  // Run scorers
  const sample = { input, output, expected };
  const scorerResults = runScorers(scorers, sample);

  // Build scores and passedByScorer maps
  const scores = {};
  const passedByScorer = {};

  for (const scorer of scorers) {
    const result = scorerResults[scorer.name];
    scores[scorer.name] = result.score;

    // Determine pass for this scorer:
    // If there's a threshold for this scorer, use score >= threshold
    // Otherwise, fall back to scorer's own `passed` field
    if (effectiveThresholds[scorer.name] !== undefined) {
      passedByScorer[scorer.name] = result.score >= effectiveThresholds[scorer.name];
    } else {
      // Use scorer's own passed field if present
      passedByScorer[scorer.name] = result.passed !== undefined ? result.passed : true;
    }
  }

  // Overall case passed = all scorer checks pass
  const passed = Object.values(passedByScorer).every(Boolean);

  return {
    id,
    tags: tags || [],
    scores,
    passedByScorer,
    passed,
  };
}

// ---------------------------------------------------------------------------
// Internal: concurrency-limited batch processing
// ---------------------------------------------------------------------------

/**
 * Process an array of async tasks with a maximum concurrency limit.
 *
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} concurrency
 * @returns {Promise<Array<any>>}
 */
async function runConcurrent(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = [];
  const limit = Math.min(concurrency, tasks.length);
  for (let i = 0; i < limit; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main: runEvals
// ---------------------------------------------------------------------------

/**
 * Run an eval dataset against a set of scorers.
 *
 * DETERMINISM: No internal Date.now() or Math.random() calls.
 * Timestamps/versions must be passed via `metadata`.
 *
 * @param {Object} opts
 * @param {Array<any>} opts.dataset - Raw eval cases (validated by loadDataset)
 * @param {Array<{name:string,score:Function}>} opts.scorers - Scorer instances
 * @param {Object} [opts.thresholds={}] - Global score thresholds { [scorerName]: number }
 * @param {AbortSignal|null} [opts.signal=null] - Abort signal for early cancellation
 * @param {number} [opts.timeoutMs=30000] - Per-case generate timeout in ms
 * @param {number} [opts.concurrency=4] - Max concurrent generate calls
 * @param {Object} [opts.metadata={}] - Caller-injected metadata (datasetVersion, commit, generatedAt, etc.)
 *
 * @returns {Promise<{
 *   results: Array<{id, tags, scores, passedByScorer, passed, error?}>,
 *   summary: { byScorer:{[name]:{avg,min,max,passRate}}, overallPassRate, failed:string[], errored:string[], total:number },
 *   meta: { ...metadata, datasetSize:number, scorerNames:string[], generatedAt:string|null },
 *   loadErrors: string[],
 * }>}
 */
async function runEvals({
  dataset,
  scorers = [],
  thresholds = {},
  signal = null,
  timeoutMs = 30000,
  concurrency = 4,
  metadata = {},
}) {
  // Step 1: Load and validate dataset
  const { cases, errors: loadErrors } = loadDataset(dataset);

  // Step 2: Handle pre-aborted signal — mark all as skipped/errored
  if (signal && signal.aborted) {
    const results = cases.map((c) => ({
      id: c.id,
      tags: c.tags,
      scores: {},
      passedByScorer: {},
      passed: false,
      error: "aborted: signal was aborted before run started",
    }));

    return {
      results,
      summary: buildSummary(results, scorers),
      meta: buildMeta(metadata, cases.length, scorers),
      loadErrors,
    };
  }

  // Step 3: Build tasks
  const tasks = cases.map((evalCase) => async () => {
    // Check signal before each case
    if (signal && signal.aborted) {
      return {
        id: evalCase.id,
        tags: evalCase.tags,
        scores: {},
        passedByScorer: {},
        passed: false,
        error: "aborted: operation was cancelled",
      };
    }
    return processCase(evalCase, scorers, thresholds, timeoutMs, signal);
  });

  // Step 4: Run with concurrency limit
  const results = await runConcurrent(tasks, Math.max(1, concurrency));

  // Step 5: Aggregate summary
  const summary = buildSummary(results, scorers);

  // Step 6: Build meta (deterministic — no Date.now())
  const meta = buildMeta(metadata, cases.length, scorers);

  return { results, summary, meta, loadErrors };
}

// ---------------------------------------------------------------------------
// Internal: build summary
// ---------------------------------------------------------------------------

function buildSummary(results, scorers) {
  const scorerNames = scorers.map((s) => s.name);
  const failed = [];
  const errored = [];

  // Per-scorer accumulators
  const scorerData = {};
  for (const name of scorerNames) {
    scorerData[name] = { sum: 0, min: Infinity, max: -Infinity, passed: 0, count: 0 };
  }

  let overallPassed = 0;

  for (const r of results) {
    if (r.error) {
      errored.push(r.id);
    }

    if (!r.passed) {
      if (!r.error) {
        failed.push(r.id);
      }
    } else {
      overallPassed++;
    }

    // Accumulate scorer stats
    for (const name of scorerNames) {
      const score = r.scores[name];
      if (score === undefined) continue;
      const d = scorerData[name];
      d.sum += score;
      d.count++;
      if (score < d.min) d.min = score;
      if (score > d.max) d.max = score;
      if (r.passedByScorer && r.passedByScorer[name]) d.passed++;
    }
  }

  const byScorer = {};
  for (const name of scorerNames) {
    const d = scorerData[name];
    if (d.count === 0) {
      byScorer[name] = { avg: 0, min: 0, max: 0, passRate: 0 };
    } else {
      byScorer[name] = {
        avg: d.sum / d.count,
        min: d.min === Infinity ? 0 : d.min,
        max: d.max === -Infinity ? 0 : d.max,
        passRate: d.passed / d.count,
      };
    }
  }

  const total = results.length;
  const overallPassRate = total === 0 ? 1 : overallPassed / total;

  return { byScorer, overallPassRate, failed, errored, total };
}

// ---------------------------------------------------------------------------
// Internal: build meta (deterministic — no Date.now())
// ---------------------------------------------------------------------------

function buildMeta(metadata, datasetSize, scorers) {
  return {
    ...metadata,
    datasetSize,
    scorerNames: scorers.map((s) => s.name),
    // generatedAt comes ONLY from caller-injected metadata — never from Date.now()
    generatedAt: metadata.generatedAt !== undefined ? metadata.generatedAt : null,
  };
}

module.exports = { runEvals };
