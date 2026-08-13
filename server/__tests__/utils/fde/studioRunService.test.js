const mockResolveBindings = jest.fn();
const mockRun = {
  TRIGGER: { MANUAL: "manual" },
  STATUS: {
    RUNNING: "running",
    SUCCEEDED: "succeeded",
    FAILED: "failed",
    CANCELLED: "cancelled",
  },
  create: jest.fn(),
  getById: jest.fn(),
  updateStatus: jest.fn(),
};
const mockRunner = jest.fn();
const mockDrafts = { getById: jest.fn() };
const mockAppend = jest.fn();
const mockPersistArtifact = jest.fn();
const mockPrisma = { workspaces: { findUnique: jest.fn() } };

jest.mock("../../../utils/prisma", () => mockPrisma);
jest.mock("../../../utils/fde/studioWorkflowBindings", () => ({
  resolveBindings: (...args) => mockResolveBindings(...args),
}));
jest.mock("../../../models/run", () => ({ Run: mockRun }));
jest.mock("../../../models/runEvent", () => ({
  RunEvent: { append: (...args) => mockAppend(...args) },
}));
jest.mock("../../../models/fdeWorkflowDraft", () => {
  const actual = jest.requireActual("../../../models/fdeWorkflowDraft");
  return { ...actual, FdeWorkflowDraft: mockDrafts };
});
jest.mock("../../../utils/fde/studioWorkflowRunner", () => ({
  runStudioWorkflow: (...args) => mockRunner(...args),
}));
jest.mock("../../../utils/fde/studioRunArtifact", () => ({
  persistStudioOutputArtifact: (...args) => mockPersistArtifact(...args),
}));
jest.mock("../../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
  getLLMProvider: jest.fn(),
}));

const { computeReviewSubjectDigest, computeSpecDigest } = jest.requireActual(
  "../../../models/fdeWorkflowDraft"
);
const {
  createStudioRun,
  executeStudioRun,
} = require("../../../utils/fde/studioRunService");

function publishedDraft(overrides = {}) {
  const spec = {
    workflow: {
      inputs: [],
      required_bindings: [
        { kind: "dataset", handle: "workspace_kb", required: true },
      ],
    },
  };
  const resolved = {
    dataset: {
      workspace_kb: { docId: "doc-a", vectorNamespace: "clinic-a" },
    },
    model: {},
  };
  const fields = {
    id: "draft-a",
    workspaceId: 7,
    lineageKey: "lineage-a",
    status: "published",
    engine: "mastra",
    compilerVersion: "compiler-a",
    targetVersion: "1",
    schemaVersion: "1.0",
    studioReviewPolicyVersion: "1",
    specJson: JSON.stringify(spec),
    specDigest: computeSpecDigest(spec),
    resolvedBindingsJson: JSON.stringify(resolved),
    missingBindingsJson: "[]",
    reviewStatus: "approved",
  };
  fields.reviewSubjectDigest = computeReviewSubjectDigest({
    specDigest: fields.specDigest,
    compilerVersion: fields.compilerVersion,
    targetVersion: fields.targetVersion,
    schemaVersion: fields.schemaVersion,
    engine: fields.engine,
    resolvedBindings: resolved,
    studioReviewPolicyVersion: fields.studioReviewPolicyVersion,
  });
  fields.reviewedSubjectDigest = fields.reviewSubjectDigest;
  return { ...fields, ...overrides };
}

describe("Studio run service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const draft = publishedDraft();
    mockResolveBindings.mockResolvedValue({
      resolved: JSON.parse(draft.resolvedBindingsJson),
      missing: [],
    });
    mockRun.create.mockResolvedValue({ id: "run-a", status: "queued" });
    mockRun.getById.mockResolvedValue({
      id: "run-a",
      workspaceId: 7,
      fdeWorkflowDraftId: "draft-a",
      engine: "mastra",
      metadata: JSON.stringify({
        fdeDraftId: "draft-a",
        inputs: { name: "value" },
      }),
    });
    mockDrafts.getById.mockResolvedValue(draft);
    mockPrisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
    });
    mockRunner.mockResolvedValue({ status: "succeeded", outputs: {} });
    mockPersistArtifact.mockResolvedValue({ id: "artifact-a" });
  });

  it("recomputes bindings and the review subject before creating an explicit-engine run", async () => {
    const draft = publishedDraft();
    await createStudioRun({
      draft,
      workspace: { id: 7, slug: "clinic-a" },
      inputs: { name: "value" },
      actor: { id: 12, role: "manager" },
      engine: "mastra",
    });

    expect(mockRun.create).toHaveBeenCalledWith({
      threadId: "lineage-a",
      workspaceId: 7,
      triggerType: "manual",
      engine: "mastra",
      fdeWorkflowDraftId: "draft-a",
      metadata: {
        fdeDraftId: "draft-a",
        inputs: { name: "value" },
        actorUserId: 12,
      },
    });
  });

  it("fails closed when fresh bindings drift from the approved subject", async () => {
    mockResolveBindings.mockResolvedValue({
      resolved: {
        dataset: {
          workspace_kb: { docId: "doc-other", vectorNamespace: "clinic-a" },
        },
        model: {},
      },
      missing: [],
    });

    await expect(
      createStudioRun({
        draft: publishedDraft(),
        workspace: { id: 7, slug: "clinic-a" },
        inputs: {},
        actor: { id: 12 },
        engine: "mastra",
      })
    ).rejects.toMatchObject({ code: "STUDIO_RUN_APPROVAL_STALE" });
    expect(mockRun.create).not.toHaveBeenCalled();
  });

  it("executes a persisted run without accepting an engine override", async () => {
    await executeStudioRun("run-a");
    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-a",
        engine: "mastra",
        draft: expect.objectContaining({ id: "draft-a" }),
        workspace: { id: 7, slug: "clinic-a" },
        inputs: { name: "value" },
      })
    );
    expect(mockRun.updateStatus).toHaveBeenCalledWith("run-a", "succeeded");
    expect(mockPersistArtifact).toHaveBeenCalledWith({
      runId: "run-a",
      outputs: {},
    });
  });

  it("records a stable redacted failure event without the thrown detail", async () => {
    const error = new Error("Bearer top-secret-token");
    error.code = "STUDIO_EXEC_MODEL_FAILED";
    mockRunner.mockRejectedValue(error);

    await expect(executeStudioRun("run-a")).rejects.toBe(error);

    expect(mockAppend).toHaveBeenCalledWith({
      runId: "run-a",
      type: "status.failed",
      payload: { errorCode: "STUDIO_EXEC_MODEL_FAILED" },
    });
    expect(JSON.stringify(mockAppend.mock.calls)).not.toContain(
      "top-secret-token"
    );
  });
});
