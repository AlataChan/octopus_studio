const prisma = require("../../utils/prisma");
const { FdeRunCheckpoint } = require("../../models/fdeRunCheckpoint");
const { FdeWorkflowDraft } = require("../../models/fdeWorkflowDraft");
const { Run } = require("../../models/run");
const { RunEvent } = require("../../models/runEvent");
const { executeStudioRun } = require("../../utils/fde/studioRunService");
const { runStudioWorkflow } = require("../../utils/fde/studioWorkflowRunner");
const { safeJsonParse } = require("../../utils/http");

const STRUCTURED_RESPONSE = {
  answer:
    "Standard returns are accepted within 30 days when the item meets the workspace policy conditions.",
  confidence: "high",
  escalate: false,
};

async function crashAfterDurableModelResult(runId) {
  const run = await Run.getById(runId);
  const [draft, workspace] = await Promise.all([
    FdeWorkflowDraft.getById(run.fdeWorkflowDraftId),
    prisma.workspaces.findUnique({ where: { id: run.workspaceId } }),
  ]);
  const checkpointStore = {
    ...FdeRunCheckpoint,
    async storeAttemptResult(args) {
      const row = await FdeRunCheckpoint.storeAttemptResult(args);
      process.stdout.write("CHECKPOINT_WRITTEN\n");
      await new Promise(() => {});
      return row;
    },
  };
  await runStudioWorkflow({
    runId,
    engine: run.engine,
    draft,
    workspace,
    inputs: safeJsonParse(run.metadata, {}).inputs,
    checkpointStore,
    resolveDataset: async () => [
      {
        text: "Unused items that meet policy conditions may be returned within 30 days of delivery.",
        score: 1,
        docId: "returns-policy",
      },
    ],
    invokeModel: async ({ outputSchema }) => {
      if (!outputSchema) throw new Error("structured schema missing");
      return {
        text: JSON.stringify(STRUCTURED_RESPONSE),
        provider: "deterministic",
        model: "ecommerce-demo-model",
        usage: { totalTokens: 15 },
        pricingSource: "test-fixture",
      };
    },
    emitEvent: (event) => RunEvent.append({ runId, ...event }),
    leaseOwner: "ecommerce-process-before-crash",
    leaseMs: 5,
  });
}

async function resumeInFreshProcess(runId) {
  const result = await executeStudioRun(runId);
  const [run, checkpoint, artifacts, events, draft] = await Promise.all([
    Run.getById(runId),
    FdeRunCheckpoint.get(runId),
    prisma.run_artifacts.findMany({ where: { runId } }),
    prisma.run_events.findMany({ where: { runId }, orderBy: { seq: "asc" } }),
    prisma.runs
      .findUnique({ where: { id: runId } })
      .then((row) => FdeWorkflowDraft.getById(row.fdeWorkflowDraftId)),
  ]);
  process.stdout.write(
    `${JSON.stringify({ result, run, checkpoint, artifacts, events, draft })}\n`
  );
}

const mode = process.argv[2];
const runId = process.argv[3];
const operation =
  mode === "crash"
    ? crashAfterDurableModelResult(runId)
    : resumeInFreshProcess(runId);
operation
  .catch((error) => {
    process.stderr.write(`${error.code || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
