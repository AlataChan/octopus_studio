const fs = require("fs");
const { Mastra } = require("@mastra/core/mastra");
const { InMemoryStore, MastraCompositeStore } = require("@mastra/core/storage");
const {
  createStep,
  createWorkflow,
  getWorkflowSuspendedStep,
} = require("@mastra/core/workflows");
const { z } = require("zod");
const { JsonWorkflowStorage } = require("./jsonWorkflowStorage");
const { NoOpWorkflowStorage } = require("./noOpWorkflowStorage");

function approvalWorkflow() {
  const approval = createStep({
    id: "approval",
    inputSchema: z.object({ value: z.number() }),
    outputSchema: z.object({ value: z.number() }),
    suspendSchema: z.object({ reason: z.string() }),
    resumeSchema: z.object({ approved: z.boolean() }),
    execute: async ({ inputData, resumeData, suspend }) => {
      if (resumeData?.approved !== true) {
        return suspend({ reason: "approval-required" });
      }
      return { value: inputData.value + 1 };
    },
  });
  const workflow = createWorkflow({
    id: "m05-approval",
    inputSchema: z.object({ value: z.number() }),
    outputSchema: z.object({ value: z.number() }),
  })
    .then(approval)
    .commit();
  return { workflow, approval };
}

async function setup(kind) {
  const { workflow, approval } = approvalWorkflow();
  let storage;
  if (kind === "memory") {
    storage = new InMemoryStore({ id: "m05-memory" });
  } else if (kind === "noop") {
    storage = new MastraCompositeStore({
      id: "m05-noop-composite",
      domains: { workflows: new NoOpWorkflowStorage() },
    });
  } else if (kind !== "none") {
    const workflows = await JsonWorkflowStorage.create(kind);
    storage = new MastraCompositeStore({
      id: "m05-json-composite",
      domains: { workflows },
    });
  }
  const mastra = new Mastra({
    workflows: { approval: workflow },
    ...(storage ? { storage } : {}),
    logger: false,
  });
  return { workflow: mastra.getWorkflow("approval"), approval, storage };
}

async function inMemoryEvidence() {
  const runId = "run-in-memory";
  const { workflow, approval, storage } = await setup("memory");
  const run = await workflow.createRun({ runId });
  const started = await run.start({ inputData: { value: 7 } });
  const state = await workflow.getWorkflowRunById(runId);
  const workflows = await storage.getStore("workflows");
  const snapshot = await workflows.loadWorkflowSnapshot({
    workflowName: workflow.id,
    runId,
  });
  const active = await workflow.listActiveWorkflowRuns();
  await workflow.restartAllActiveWorkflowRuns();
  const afterRestart = await workflow.getWorkflowRunById(runId);
  const resumed = await (
    await workflow.createRun({ runId })
  ).resume({
    step: "approval",
    resumeData: { approved: true },
  });

  let waitForEvent;
  try {
    workflow.waitForEvent("approved", approval);
    waitForEvent = "NO_ERROR";
  } catch (error) {
    waitForEvent = error.id || error.code;
  }

  return {
    started: started.status,
    suspendedStep: getWorkflowSuspendedStep(state)?.stepId,
    snapshotStatus: snapshot.status,
    snapshotBytes: JSON.stringify(snapshot).length,
    activeBeforeRestart: active.total,
    statusAfterRestartAll: afterRestart.status,
    resumed: { status: resumed.status, result: resumed.result },
    waitForEvent,
  };
}

async function suspendAndHold(kind, runId) {
  const { workflow } = await setup(kind);
  const run = await workflow.createRun({ runId });
  const started = await run.start({ inputData: { value: 7 } });
  const evidence = { phase: "suspended", status: started.status };
  if (kind !== "none" && kind !== "noop") {
    evidence.persistedSnapshotBytes = fs.statSync(kind).size;
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  setInterval(() => {}, 60_000);
}

async function resumeFresh(kind, runId) {
  try {
    const { workflow } = await setup(kind);
    const run = await workflow.createRun({ runId });
    const result = await run.resume({
      step: "approval",
      resumeData: { approved: true },
    });
    return {
      status: result.status,
      result: result.result,
      ...(kind === "none" || kind === "noop"
        ? {}
        : { storageKind: "full-mastra-snapshot" }),
    };
  } catch (error) {
    const messages = [];
    let current = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    let code = "RESUME_FAILED";
    if (
      messages.some((message) =>
        message.startsWith("No snapshot found for this workflow run:")
      )
    ) {
      code = "NO_SNAPSHOT";
    } else if (messages.includes("This workflow run was not suspended")) {
      code = "NOT_SUSPENDED";
    }
    return {
      status: "error",
      error: code,
    };
  }
}

module.exports = {
  inMemoryEvidence,
  resumeFresh,
  suspendAndHold,
};
