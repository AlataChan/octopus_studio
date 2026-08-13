#!/usr/bin/env node
/**
 * M0 cross-repository smoke command. Injects deterministic model and retrieval
 * doubles; never contacts an external service. Prints exactly one JSON object.
 */
const fs = require("fs");
const { importStudioWorkflowSpec } = require("../utils/fde/studioWorkflowImporter");
const { executeStudioWorkflow } = require("../utils/fde/spike/studioMastraExecutor");
const { createDeterministicWorkAgentModel } = require("../utils/workAgent/deterministicModel");

const SECRET_PATTERN = /(token|secret|password|api[_-]?key|authorization)/i;

function parseArgs(argv) {
  const args = { approved: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--approved") { args.approved = true; continue; }
    if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  }
  return args;
}

function countSecretLeaks(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countSecretLeaks(v), 0);
  if (value === null || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (n, [k, v]) => n + (SECRET_PATTERN.test(k) ? 1 : 0) + countSecretLeaks(v),
    0
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ["spec", "bindings", "inputs"]) {
    if (!args[required]) {
      process.stderr.write(`SPIKE_ARG_MISSING: --${required} is required\n`);
      process.exit(2);
    }
  }

  const spec = JSON.parse(fs.readFileSync(args.spec, "utf-8"));
  const bindings = JSON.parse(fs.readFileSync(args.bindings, "utf-8"));
  const inputs = JSON.parse(fs.readFileSync(args.inputs, "utf-8"));

  const imported = importStudioWorkflowSpec({ spec, tenantId: "spike-tenant", bindings });
  const result = await executeStudioWorkflow({
    imported,
    inputs,
    approved: args.approved,
    resolveDataset: async (datasetId, query) =>
      `[spike-retrieval ${datasetId}] policy excerpt for: ${query}`,
    model: createDeterministicWorkAgentModel({ goal: "studio-v1 spike" }),
  });

  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      engine: result.engine,
      contract: imported.contract,
      sourceIrHash: result.sourceIrHash,
      reviewEnforced: imported.reviewPolicy.publishRequiresReview,
      missingBindings: imported.missingBindings,
      secretLeakCount: countSecretLeaks(result),
      outputs: result.outputs,
      traceLength: result.trace.length,
    }, null, 2)}\n`,
    () => process.exit(0)
  );
}

main().catch((error) => {
  process.stderr.write(`${error.code || "SPIKE_FAILED"}: ${error.name}\n`);
  process.exit(1);
});
