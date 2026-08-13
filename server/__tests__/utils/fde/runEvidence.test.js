const {
  approvalEvidence,
  modelCostEvidence,
  nodeEvidence,
  retrievalEvidence,
  runStatusEvidence,
} = require("../../../utils/fde/runEvidence");

describe("FDE evidence vocabulary", () => {
  it("uses existing dotted transport names with the reviewed payload fields", () => {
    expect(
      runStatusEvidence("started", {
        engine: "mastra",
        fdeDraftId: "draft-a",
        sourceIrHash: "a".repeat(64),
      })
    ).toMatchObject({ type: "status.started" });
    expect(
      nodeEvidence("completed", { nodeId: "draft", nodeType: "llm" })
    ).toMatchObject({
      type: "step.completed",
    });
    expect(retrievalEvidence({ docId: "doc-a", chunkCount: 2 })).toEqual({
      type: "tool.result",
      payload: { tool: "retrieval", docId: "doc-a", chunkCount: 2 },
    });
  });

  it("keeps existing cost names and in-run approvals in the approval base type", () => {
    expect(
      modelCostEvidence({
        provider: "openai",
        model: "gpt-test",
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
        costUsd: 0.01,
        pricingSource: "catalog",
      })
    ).toEqual({
      type: "cost.updated",
      payload: {
        provider: "openai",
        model: "gpt-test",
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
        costUsd: 0.01,
        pricingSource: "catalog",
      },
    });
    expect(
      approvalEvidence("requested", { subjectDigest: "subject-a" })
    ).toEqual({
      type: "approval.requested",
      payload: { subjectDigest: "subject-a" },
    });
  });
});
