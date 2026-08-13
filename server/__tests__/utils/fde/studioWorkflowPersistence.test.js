jest.mock("../../../utils/fde/studioWorkflowBindings", () => ({
  RESERVED_DATASET_HANDLE: "workspace_kb",
  resolveBindings: jest.fn(),
}));
jest.mock("../../../models/fdeWorkflowDraft", () => ({
  FdeWorkflowDraft: { upsertRevision: jest.fn() },
  STUDIO_REVIEW_POLICY_VERSION: "1",
}));

const {
  COMPILER_VERSION,
  lineageKeyFor,
  persistStudioWorkflowSpec,
} = require("../../../utils/fde/studioWorkflowImporter");
const {
  resolveBindings,
} = require("../../../utils/fde/studioWorkflowBindings");
const { FdeWorkflowDraft } = require("../../../models/fdeWorkflowDraft");
const { validSpec } = require("./studioSpecFixture");

describe("persistStudioWorkflowSpec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveBindings.mockResolvedValue({
      resolved: {
        model: {
          "default-chat-model": {
            provider: "openai",
            model: "gpt-4o-mini",
          },
        },
        dataset: {
          workspace_kb: { docId: "doc-7", vectorNamespace: "clinic-a" },
        },
      },
      missing: [],
    });
    FdeWorkflowDraft.upsertRevision.mockResolvedValue({ id: "draft-1" });
  });

  it("pins approval provenance to the current FDE compiler commit", () => {
    expect(COMPILER_VERSION).toBe(
      "fde-studio-v1@e87b6c75674900e4a750925e83ab1cf03bcbb999"
    );
  });

  it("resolves tenant-scoped bindings and persists through the draft model", async () => {
    const spec = validSpec();
    spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
      "workspace_kb";
    spec.workflow.required_bindings.find(
      (binding) => binding.kind === "dataset"
    ).handle = "workspace_kb";

    const result = await persistStudioWorkflowSpec({
      spec,
      workspaceId: 7,
      actorUserId: 12,
    });

    expect(resolveBindings).toHaveBeenCalledWith({
      workspaceId: 7,
      requiredBindings: spec.workflow.required_bindings,
    });
    expect(FdeWorkflowDraft.upsertRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        name: "Cross-Border Support Follow-up Message Draft",
        contract: "studio-v1",
        targetVersion: "1",
        schemaVersion: "1.0",
        sourceIrVersion: "0.3",
        sourceIrHash: "b".repeat(64),
        engine: "mastra",
        createdByUserId: 12,
        missingBindings: [],
      })
    );
    expect(result).toEqual({ id: "draft-1" });
  });

  it("persists a v1.1 structured spec with the new compiler provenance", async () => {
    const spec = validSpec();
    spec.schema_version = "1.1";
    spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
      "workspace_kb";
    spec.workflow.required_bindings.find(
      (binding) => binding.kind === "dataset"
    ).handle = "workspace_kb";
    spec.workflow.nodes.find((node) => node.type === "llm").output_schema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };

    await persistStudioWorkflowSpec({ spec, workspaceId: 7, actorUserId: 12 });

    expect(FdeWorkflowDraft.upsertRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: "1.1",
        compilerVersion: COMPILER_VERSION,
        spec: expect.objectContaining({ schema_version: "1.1" }),
      })
    );
  });

  it("uses an explicit Studio lineage and parent without putting them in the spec", async () => {
    const spec = validSpec();
    spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
      "workspace_kb";
    spec.workflow.required_bindings.find(
      (binding) => binding.kind === "dataset"
    ).handle = "workspace_kb";

    await persistStudioWorkflowSpec({
      spec,
      workspaceId: 7,
      actorUserId: 12,
      lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2",
      parentDraftId: "c08a0bc2-fbdb-490a-8230-0cd16a5230b7",
    });

    expect(FdeWorkflowDraft.upsertRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2",
        parentDraftId: "c08a0bc2-fbdb-490a-8230-0cd16a5230b7",
      })
    );
    expect(spec).not.toHaveProperty("lineageKey");
    expect(spec).not.toHaveProperty("parentDraftId");
  });

  it("mints a fresh UUID lineage when the caller omits one", () => {
    const first = lineageKeyFor();
    const second = lineageKeyFor();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });

  it.each([
    ["lineageKey", "not-a-uuid"],
    ["parentDraftId", "not-a-uuid"],
  ])(
    "rejects a malformed %s at the direct persistence boundary",
    async (field, value) => {
      const spec = validSpec();
      spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
        "workspace_kb";
      spec.workflow.required_bindings.find(
        (binding) => binding.kind === "dataset"
      ).handle = "workspace_kb";

      await expect(
        persistStudioWorkflowSpec({
          spec,
          workspaceId: 7,
          actorUserId: 12,
          [field]: value,
        })
      ).rejects.toMatchObject({ code: "STUDIO_LINEAGE_REFERENCE_INVALID" });
      expect(FdeWorkflowDraft.upsertRevision).not.toHaveBeenCalled();
    }
  );

  it("fails closed when the compiler emits a document-scoped handle", async () => {
    await expect(
      persistStudioWorkflowSpec({
        spec: validSpec(),
        workspaceId: 7,
        actorUserId: 12,
      })
    ).rejects.toMatchObject({
      code: "STUDIO_BINDING_DATASET_SCOPE_UNSUPPORTED",
    });
    expect(resolveBindings).not.toHaveBeenCalled();
    expect(FdeWorkflowDraft.upsertRevision).not.toHaveBeenCalled();
  });

  it.each(["Bearer abc123", "sk-test-secret", "OPENAI_API_KEY=abc123"])(
    "rejects a secret-like value at the direct persistence boundary: %s",
    async (secretValue) => {
      const spec = validSpec();
      spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
        "workspace_kb";
      spec.workflow.required_bindings.find(
        (binding) => binding.kind === "dataset"
      ).handle = "workspace_kb";
      spec.workflow.nodes.find((node) => node.type === "llm").prompt =
        secretValue;

      await expect(
        persistStudioWorkflowSpec({ spec, workspaceId: 7, actorUserId: 12 })
      ).rejects.toMatchObject({ code: "STUDIO_SPEC_SECRET_VALUE" });
      expect(resolveBindings).not.toHaveBeenCalled();
      expect(FdeWorkflowDraft.upsertRevision).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "retrieval node",
      (spec) => {
        spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
          "document_scope";
        spec.workflow.required_bindings.find(
          (binding) => binding.kind === "dataset"
        ).handle = "workspace_kb";
      },
    ],
    [
      "llm node",
      (spec) => {
        spec.workflow.nodes.find((node) => node.type === "llm").model =
          "unlisted-model";
      },
    ],
    [
      "extra declaration",
      (spec) => {
        spec.workflow.required_bindings.push({
          kind: "model",
          handle: "extra-model",
          required: true,
        });
      },
    ],
    [
      "duplicate declaration",
      (spec) => {
        spec.workflow.required_bindings.push({
          ...spec.workflow.required_bindings[0],
        });
      },
    ],
    [
      "optional declaration",
      (spec) => {
        spec.workflow.required_bindings[0].required = false;
      },
    ],
  ])("rejects a binding manifest mismatch in the %s", async (_name, mutate) => {
    const spec = validSpec();
    spec.workflow.nodes.find((node) => node.type === "retrieval").dataset =
      "workspace_kb";
    spec.workflow.required_bindings.find(
      (binding) => binding.kind === "dataset"
    ).handle = "workspace_kb";
    mutate(spec);

    await expect(
      persistStudioWorkflowSpec({ spec, workspaceId: 7, actorUserId: 12 })
    ).rejects.toMatchObject({ code: "STUDIO_BINDING_MANIFEST_MISMATCH" });
    expect(resolveBindings).not.toHaveBeenCalled();
    expect(FdeWorkflowDraft.upsertRevision).not.toHaveBeenCalled();
  });
});
