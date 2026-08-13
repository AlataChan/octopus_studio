const { Run } = require("../../models/run");
const { RunEvent } = require("../../models/runEvent");
const { FdeWorkflowDraft } = require("../../models/fdeWorkflowDraft");
const prisma = require("../prisma");
const { safeJsonParse } = require("../http");
const { getLLMProvider, getVectorDbClass } = require("../helpers");
const {
  computeReviewSubjectDigest,
  computeSpecDigest,
  STUDIO_REVIEW_POLICY_VERSION,
} = require("../../models/fdeWorkflowDraft");
const { resolveBindings } = require("./studioWorkflowBindings");
const { runStudioWorkflow } = require("./studioWorkflowRunner");
const { runStatusEvidence } = require("./runEvidence");
const { persistStudioOutputArtifact } = require("./studioRunArtifact");

class StudioRunError extends Error {
  constructor(code, status = 409, path = "run") {
    super(code);
    this.name = "StudioRunError";
    this.code = code;
    this.status = status;
    this.path = path;
  }
}

function requiredBindings(spec) {
  const bindings = spec?.workflow?.required_bindings;
  if (!Array.isArray(bindings)) {
    throw new StudioRunError("STUDIO_RUN_SPEC_INVALID");
  }
  return bindings;
}

async function freshApprovedDraft(draft, workspace) {
  if (
    !draft ||
    draft.status !== "published" ||
    Number(draft.workspaceId) !== Number(workspace.id)
  ) {
    throw new StudioRunError("STUDIO_RUN_PUBLISHED_REQUIRED");
  }
  let spec;
  try {
    spec = JSON.parse(draft.specJson);
  } catch {
    throw new StudioRunError("STUDIO_RUN_SPEC_INVALID");
  }
  const { resolved, missing } = await resolveBindings({
    workspaceId: workspace.id,
    requiredBindings: requiredBindings(spec),
  });
  if (missing.length) {
    throw new StudioRunError("STUDIO_RUN_BINDING_MISSING", 409, "bindings");
  }
  const specDigest = computeSpecDigest(spec);
  const subject = computeReviewSubjectDigest({
    specDigest,
    compilerVersion: draft.compilerVersion,
    targetVersion: draft.targetVersion,
    schemaVersion: draft.schemaVersion,
    engine: draft.engine,
    resolvedBindings: resolved,
    studioReviewPolicyVersion:
      draft.studioReviewPolicyVersion || STUDIO_REVIEW_POLICY_VERSION,
  });
  if (
    draft.reviewStatus !== "approved" ||
    !draft.reviewedSubjectDigest ||
    draft.reviewedSubjectDigest !== subject ||
    draft.reviewSubjectDigest !== subject ||
    draft.specDigest !== specDigest
  ) {
    throw new StudioRunError("STUDIO_RUN_APPROVAL_STALE", 409, "review");
  }
  return {
    ...draft,
    specJson: JSON.stringify(spec),
    resolvedBindingsJson: JSON.stringify(resolved),
    missingBindingsJson: "[]",
  };
}

async function createStudioRun({ draft, workspace, inputs, actor, engine }) {
  if (draft.engine !== engine) {
    throw new StudioRunError("STUDIO_EXEC_ENGINE_MISMATCH");
  }
  const fresh = await freshApprovedDraft(draft, workspace);
  return Run.create({
    threadId: fresh.lineageKey,
    workspaceId: workspace.id,
    triggerType: Run.TRIGGER.MANUAL,
    engine,
    fdeWorkflowDraftId: fresh.id,
    metadata: {
      fdeDraftId: fresh.id,
      inputs,
      actorUserId: actor?.id ?? null,
    },
  });
}

async function resolveWorkspaceDataset({ workspace, query, topK }) {
  const VectorDb = getVectorDbClass();
  const result = await VectorDb.performSimilaritySearch({
    namespace: workspace.slug,
    input: query,
    LLMConnector: getLLMProvider(),
    similarityThreshold: workspace.similarityThreshold ?? 0.25,
    topN: topK,
    rerank: workspace.vectorSearchMode === "rerank",
  });
  if (result.message) throw new StudioRunError("STUDIO_EXEC_RETRIEVAL_FAILED");
  return (result.sources || []).map((source, index) => ({
    text: String(source.text || result.contextTexts?.[index] || ""),
    score: Number(source.score ?? source._distance ?? 0),
    docId: String(source.docId || source.id || "workspace_kb"),
  }));
}

async function executeStudioRun(runId) {
  const run = await Run.getById(String(runId));
  if (!run?.fdeWorkflowDraftId) {
    throw new StudioRunError("STUDIO_RUN_NOT_FOUND", 404);
  }
  if (run.status === Run.STATUS.CANCELLED) return run;
  const [draft, workspace] = await Promise.all([
    FdeWorkflowDraft.getById(run.fdeWorkflowDraftId),
    prisma.workspaces.findUnique({ where: { id: Number(run.workspaceId) } }),
  ]);
  if (!draft || !workspace || draft.engine !== run.engine) {
    throw new StudioRunError("STUDIO_EXEC_ENGINE_MISMATCH");
  }
  const fresh = await freshApprovedDraft(draft, workspace);
  const metadata = safeJsonParse(run.metadata, {});
  await Run.updateStatus(run.id, Run.STATUS.RUNNING);
  try {
    const result = await runStudioWorkflow({
      runId: run.id,
      engine: run.engine,
      draft: fresh,
      workspace,
      inputs: metadata.inputs || {},
      authCtx: {
        userId: metadata.actorUserId ?? null,
        role: null,
      },
      resolveDataset: resolveWorkspaceDataset,
      emitEvent: (event) =>
        RunEvent.append({
          runId: run.id,
          type: event.type,
          payload: event.payload,
        }),
      isCancelled: async () =>
        (await Run.getById(run.id))?.status === Run.STATUS.CANCELLED,
    });
    await persistStudioOutputArtifact({
      runId: run.id,
      outputs: result.outputs,
    });
    await Run.updateStatus(run.id, Run.STATUS.SUCCEEDED);
    return result;
  } catch (error) {
    if (
      !["STUDIO_CHECKPOINT_CONFLICT", "STUDIO_RUN_CANCELLED"].includes(
        error?.code
      )
    ) {
      await Run.updateStatus(run.id, Run.STATUS.FAILED, {
        errorCode: error?.code || "STUDIO_RUN_FAILED",
        errorDetail: error?.code || "STUDIO_RUN_FAILED",
      });
      const event = runStatusEvidence("failed", {
        errorCode: error?.code || "STUDIO_RUN_FAILED",
      });
      await RunEvent.append({ runId: run.id, ...event });
    }
    throw error;
  }
}

function queueStudioRun(runId) {
  setImmediate(() => {
    executeStudioRun(runId).catch(() => {});
  });
}

async function resumeStudioRun(runId) {
  const run = await Run.getById(String(runId));
  if (!run?.fdeWorkflowDraftId) {
    throw new StudioRunError("STUDIO_RUN_NOT_FOUND", 404);
  }
  if (run.status === Run.STATUS.CANCELLED) {
    throw new StudioRunError("STUDIO_RUN_CANCELLED");
  }
  queueStudioRun(run.id);
  return run;
}

module.exports = {
  StudioRunError,
  createStudioRun,
  executeStudioRun,
  freshApprovedDraft,
  queueStudioRun,
  resolveWorkspaceDataset,
  resumeStudioRun,
};
