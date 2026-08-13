const { importStudioWorkflowSpec } = require("../../../utils/fde/studioWorkflowImporter");
const { StudioWorkflowSpecError } = require("../../../utils/fde/studioWorkflowSpec");
const { validSpec, fullBindings } = require("./studioSpecFixture");

describe("importStudioWorkflowSpec", () => {
  it("returns ready when every required binding resolves", () => {
    const result = importStudioWorkflowSpec({
      spec: validSpec(),
      tenantId: "tenant-a",
      bindings: fullBindings(),
    });
    expect(result.status).toBe("ready");
    expect(result.engine).toBe("mastra");
    expect(result.contract).toBe("studio-v1");
    expect(result.tenantId).toBe("tenant-a");
    expect(result.sourceIrHash).toBe("b".repeat(64));
    expect(result.missingBindings).toEqual([]);
    expect(result.resolvedBindings).toEqual(fullBindings());
  });

  it("applies Studio's own review policy, not one from the spec", () => {
    const result = importStudioWorkflowSpec({
      spec: validSpec(),
      tenantId: "tenant-a",
      bindings: fullBindings(),
    });
    expect(result.reviewPolicy).toEqual({
      publishRequiresReview: true,
      source: "studio-default",
    });
  });

  it("rejects a review field smuggled into the spec", () => {
    const spec = validSpec();
    spec.workflow.review = { publish_requires_review: false };
    expect(() => importStudioWorkflowSpec({
      spec, tenantId: "tenant-a", bindings: fullBindings(),
    })).toThrow(StudioWorkflowSpecError);
  });

  it("returns draft with sorted missing bindings when nothing is bound", () => {
    const result = importStudioWorkflowSpec({
      spec: validSpec(),
      tenantId: "tenant-a",
      bindings: {},
    });
    expect(result.status).toBe("draft");
    expect(result.missingBindings).toEqual([
      { kind: "dataset", handle: "clinic_policy_kb" },
      { kind: "model", handle: "default-chat-model" },
    ]);
  });

  it("returns draft when only some bindings resolve", () => {
    const result = importStudioWorkflowSpec({
      spec: validSpec(),
      tenantId: "tenant-a",
      bindings: { model: { "default-chat-model": "model-123" } },
    });
    expect(result.status).toBe("draft");
    expect(result.missingBindings).toEqual([
      { kind: "dataset", handle: "clinic_policy_kb" },
    ]);
    expect(result.resolvedBindings.dataset).toEqual({});
  });

  it("never fabricates a binding from an undeclared handle", () => {
    const result = importStudioWorkflowSpec({
      spec: validSpec(),
      tenantId: "tenant-a",
      bindings: {
        ...fullBindings(),
        dataset: { clinic_policy_kb: "dataset-456", other_kb: "dataset-999" },
      },
    });
    expect(result.resolvedBindings.dataset).toEqual({ clinic_policy_kb: "dataset-456" });
  });

  it("is idempotent: the same spec yields the same source hash and status", () => {
    const args = { spec: validSpec(), tenantId: "tenant-a", bindings: fullBindings() };
    const a = importStudioWorkflowSpec(args);
    const b = importStudioWorkflowSpec({ ...args, spec: validSpec() });
    expect(a.sourceIrHash).toBe(b.sourceIrHash);
    expect(a.status).toBe(b.status);
  });

  it("rejects an invalid spec before doing any binding work", () => {
    const spec = validSpec();
    spec.source_ir_hash = "not-a-hash";
    expect(() => importStudioWorkflowSpec({
      spec, tenantId: "tenant-a", bindings: fullBindings(),
    })).toThrow(StudioWorkflowSpecError);
  });

  it.each([null, "", undefined])("rejects a missing tenantId (%p)", (tenantId) => {
    expect(() => importStudioWorkflowSpec({
      spec: validSpec(), tenantId, bindings: fullBindings(),
    })).toThrow(StudioWorkflowSpecError);
  });
});
