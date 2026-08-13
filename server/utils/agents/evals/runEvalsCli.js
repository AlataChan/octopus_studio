"use strict";

/**
 * runEvalsCli.js — Thin CLI entry for the evals pipeline.
 *
 * USAGE:
 *   node runEvalsCli.js <dataset-path.json> [--strict]
 *
 *   <dataset-path.json>  Path to a JSON file containing an array of eval cases.
 *   --strict             Exit non-zero if any cases fail (default: report-only, exit 0).
 *
 * CI BEHAVIOUR:
 *   - Default: always exits 0 (report-only). CI pipelines are non-blocking.
 *   - With --strict: exits 1 when there are failures or errors.
 *
 * DETERMINISM:
 *   The core runner (runner.js) is deterministic (no Date.now()).
 *   This CLI entry script stamps Date.now() as `generatedAt` metadata — that is
 *   intentional: CLI is an entry script, not core logic.
 *
 * TESTABILITY:
 *   The main logic is exported as `runEvalsCliMain({ argv, readFile, log, scorers })`.
 *   All I/O is injected so unit tests can run without real fs or process.
 *
 * Exports:
 *   runEvalsCliMain({ argv, readFile, log, scorers? }) => Promise<exitCode>
 */

const fs = require("fs/promises");
const { runEvals } = require("./runner");
const { BUILTIN_SCORERS } = require("./scorer");

// ---------------------------------------------------------------------------
// Internal: format a number as percentage string
// ---------------------------------------------------------------------------
function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Internal: build default scorer instances from BUILTIN_SCORERS registry
// ---------------------------------------------------------------------------
function buildDefaultScorers() {
  return Object.values(BUILTIN_SCORERS).map((factory) => factory());
}

// ---------------------------------------------------------------------------
// Internal: print summary to log
// ---------------------------------------------------------------------------
function printSummary(summary, meta, log) {
  log("=".repeat(60));
  log("Evals Summary");
  log("=".repeat(60));
  log(`  Run at       : ${meta.generatedAt || "(no timestamp)"}`);
  log(`  Total cases  : ${summary.total}`);
  log(`  Overall pass : ${pct(summary.overallPassRate)} (${summary.failed.length + summary.errored.length} failed/errored)`);
  log("");
  log("Per-scorer stats:");
  for (const [name, stats] of Object.entries(summary.byScorer)) {
    log(
      `  ${name.padEnd(24)} avg=${stats.avg.toFixed(3)}  passRate=${pct(stats.passRate)}  min=${stats.min.toFixed(3)}  max=${stats.max.toFixed(3)}`
    );
  }

  if (summary.failed.length > 0) {
    log("");
    log(`Failed cases (${summary.failed.length}): ${summary.failed.join(", ")}`);
  }
  if (summary.errored.length > 0) {
    log(`Errored cases (${summary.errored.length}): ${summary.errored.join(", ")}`);
  }
  log("=".repeat(60));
}

// ---------------------------------------------------------------------------
// runEvalsCliMain — testable exported function
// ---------------------------------------------------------------------------

/**
 * Main CLI logic with injected I/O deps for testability.
 *
 * @param {Object} opts
 * @param {string[]} opts.argv         - process.argv-style array (argv[2] = dataset path)
 * @param {(path: string) => Promise<string>} opts.readFile - Async file reader
 * @param {(...args: any[]) => void} opts.log              - Log function (e.g. console.log)
 * @param {Array<{name:string, score:Function}>} [opts.scorers] - Override scorers (default: BUILTIN_SCORERS instances)
 *
 * @returns {Promise<number>} exit code (0 = success/report-only, 1 = error or strict+failures)
 */
async function runEvalsCliMain({ argv = [], readFile, log, scorers } = {}) {
  // -- Parse argv --
  const args = argv.slice(2);
  const strict = args.includes("--strict");
  const nonFlagArgs = args.filter((a) => !a.startsWith("--"));
  const datasetPath = nonFlagArgs[0];

  if (!datasetPath) {
    log("Usage: node runEvalsCli.js <dataset-path.json> [--strict]");
    log("Error: dataset file path argument is required");
    return 1;
  }

  // -- Load dataset file --
  let rawContent;
  try {
    rawContent = await readFile(datasetPath);
  } catch (err) {
    log(`Error: failed to read dataset file "${datasetPath}": ${err && err.message ? err.message : String(err)}`);
    return 1;
  }

  // -- Parse JSON --
  let dataset;
  try {
    dataset = JSON.parse(rawContent);
  } catch (err) {
    log(`Error: JSON parse failed for "${datasetPath}": ${err && err.message ? err.message : String(err)}`);
    return 1;
  }

  // -- Build scorers --
  // NOTE: llm_judge is NOT included here. Only deterministic BUILTIN_SCORERS by default.
  const resolvedScorers = scorers !== undefined ? scorers : buildDefaultScorers();

  // -- Run evals --
  // CLI entry script: stamp Date here (intentional — runner stays deterministic)
  const generatedAt = new Date().toISOString();

  let report;
  try {
    report = await runEvals({
      dataset,
      scorers: resolvedScorers,
      metadata: { generatedAt, source: "cli", datasetPath },
    });
  } catch (err) {
    log(`Error: runEvals failed: ${err && err.message ? err.message : String(err)}`);
    return 1;
  }

  const { summary, meta, loadErrors } = report;

  // -- Log load errors (non-fatal) --
  if (loadErrors && loadErrors.length > 0) {
    log(`Warning: ${loadErrors.length} dataset load error(s):`);
    for (const e of loadErrors) {
      log(`  - ${e}`);
    }
  }

  // -- Print summary --
  printSummary(summary, meta, log);

  // -- Exit code --
  const hasFailures = summary.failed.length > 0 || summary.errored.length > 0;
  if (strict && hasFailures) {
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// CLI entry point (only runs when executed directly)
// ---------------------------------------------------------------------------
/* istanbul ignore next */
if (require.main === module) {
  runEvalsCliMain({
    argv: process.argv,
    readFile: (p) => fs.readFile(p, "utf8"),
    log: console.log,
  }).then((exitCode) => {
    process.exit(exitCode);
  });
}

module.exports = { runEvalsCliMain };
