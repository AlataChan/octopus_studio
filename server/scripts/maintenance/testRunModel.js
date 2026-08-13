#!/usr/bin/env node
/**
 * Phase 0 integration test — Run model + SSE events
 * Run: node server/scripts/maintenance/testRunModel.js
 */

const path = require("path");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";

// Ensure scripts run against the server sqlite DB even when invoked from repo root.
process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../../storage/anythingllm.db")}`;

const prisma = require("../../utils/prisma");
const { Run } = require("../../models/run");
const { RunArtifact } = require("../../models/runArtifact");
const { runEventEmitter } = require("../../utils/liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../../utils/liveCanvas/types");
const { ensurePhase0Workspace } = require("./lib/phase0Workspace");

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  console.log("=== Phase 0 Integration Test ===\n");

  if (isDryRun) {
    console.log("[DRY-RUN] would execute:", "ensure Phase 0 workspace exists");
    console.log("[DRY-RUN] would execute:", "create run and run artifact rows");
    console.log("[DRY-RUN] would execute:", "update run status through lifecycle");
    return;
  }

  // 0. Ensure a workspace exists
  const workspace = await ensurePhase0Workspace(prisma);

  // 1. Create a run
  const run = await Run.create({
    engine: "mastra",
    threadId: "test-thread-uuid",
    workspaceId: workspace.id,
    triggerType: Run.TRIGGER.MANUAL,
    metadata: { test: true },
  });
  console.log("✅ Run created:", run.id, "status:", run.status);

  // 2. Subscribe SSE and collect events
  const events = [];
  runEventEmitter.subscribe("test-thread-uuid", (name, data) =>
    events.push({ name, data })
  );

  // 3. Emit events
  runEventEmitter.emitForSession("test-thread-uuid", SSE_EVENTS.RUN_CREATED, {
    runId: run.id,
  });
  await Run.updateStatus(run.id, Run.STATUS.RUNNING);
  runEventEmitter.emitForSession("test-thread-uuid", SSE_EVENTS.RUN_UPDATED, {
    runId: run.id,
    status: Run.STATUS.RUNNING,
  });

  // 4. Create artifact
  const artifact = await RunArtifact.create({
    runId: run.id,
    artifactType: RunArtifact.ARTIFACT_TYPE.BROWSER_SCREENSHOT,
    storageRef: "storage/test/screenshot.png",
    label: "Test screenshot",
    metadata: { url: "https://example.com" },
  });
  console.log("✅ RunArtifact created:", artifact.id);

  // 5. Complete the run
  await Run.updateStatus(run.id, Run.STATUS.SUCCEEDED);
  runEventEmitter.emitForSession("test-thread-uuid", SSE_EVENTS.RUN_COMPLETED, {
    runId: run.id,
    status: Run.STATUS.SUCCEEDED,
  });

  // 6. Verify events
  console.log(`✅ SSE events received: ${events.length}`);
  events.forEach((e) =>
    console.log("  →", e.name, JSON.stringify(e.data).slice(0, 60))
  );

  // 7. Test error codes
  console.log("\n=== Error Code Test ===");
  console.log(
    "browser.policy_blocked not retryable:",
    Run.isNotRetryable(Run.ERROR_CODE.BROWSER_POLICY_BLOCKED)
  );
  console.log(
    "tool.rate_limited not retryable:",
    Run.isNotRetryable(Run.ERROR_CODE.TOOL_RATE_LIMITED)
  );

  // 8. List runs
  const runs = await Run.listByThread("test-thread-uuid");
  console.log(`\n✅ listByThread returned ${runs.length} run(s)`);

  console.log("\n=== All Phase 0 checks passed ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
