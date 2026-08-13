describe("octopus-kb retrieval merge", () => {
  it("returns the original context when kb has no evidence", () => {
    const { mergeKbEvidence } = require("../../utils/octopusKb/retrievalMerge");
    const input = {
      contextTexts: ["vector body"],
      sources: [{ title: "Vector", docpath: "docs/vector.md" }],
      graphSummary: "graph summary",
      kbItems: [],
      tokenizer: (text) => text.length,
    };

    expect(mergeKbEvidence(input)).toEqual({
      contextTexts: ["vector body"],
      sources: [{ title: "Vector", docpath: "docs/vector.md" }],
      metadata: { status: "empty_result", itemCount: 0, sourceCount: 1 },
    });
  });

  it("dedupes by path, prefers kb evidence, and keeps deterministic path ordering", () => {
    const { mergeKbEvidence } = require("../../utils/octopusKb/retrievalMerge");

    const result = mergeKbEvidence({
      contextTexts: ["vector duplicate", "vector only", "graph summary"],
      sources: [
        { title: "Vector duplicate", docpath: "wiki/concepts/RAG.md" },
        { title: "Vector only", docpath: "raw/source.md" },
        { title: "Knowledge graph", type: "graph" },
      ],
      graphSummary: "graph summary",
      kbItems: [
        {
          path: "wiki/concepts/RAG.md",
          title: "RAG",
          reason: "title_match",
          text: "kb curated rag",
          tokenEstimate: 4,
        },
        {
          path: "wiki/entities/Vector.md",
          title: "Vector",
          reason: "backlink",
          text: "kb vector entity",
          tokenEstimate: 4,
        },
      ],
      budget: 100,
      tokenizer: (text) => text.length,
    });

    expect(result.contextTexts).toEqual([
      "kb curated rag",
      "kb vector entity",
      "graph summary",
      "vector only",
    ]);
    expect(result.sources.map((source) => source.path || source.docpath)).toEqual([
      "wiki/concepts/RAG.md",
      "wiki/entities/Vector.md",
      undefined,
      "raw/source.md",
    ]);
    expect(result.sources[0]).toEqual(
      expect.objectContaining({
        type: "kb",
        title: "RAG",
        reason: "title_match",
      })
    );
    expect(result.metadata).toEqual({
      status: "merged",
      itemCount: 2,
      sourceCount: 4,
    });
  });

  it("respects the token budget while keeping kb evidence first", () => {
    const { mergeKbEvidence } = require("../../utils/octopusKb/retrievalMerge");

    const result = mergeKbEvidence({
      contextTexts: ["vector text"],
      sources: [{ title: "Vector", docpath: "vector.md" }],
      kbItems: [
        { path: "kb/a.md", title: "A", reason: "match", text: "12345" },
        { path: "kb/b.md", title: "B", reason: "match", text: "67890" },
      ],
      budget: 6,
      tokenizer: (text) => text.length,
    });

    expect(result.contextTexts).toEqual(["12345"]);
    expect(result.sources).toEqual([
      expect.objectContaining({ type: "kb", path: "kb/a.md" }),
    ]);
  });

  it("orders kb evidence by recency score and preserves typed memory metadata", () => {
    const { mergeKbEvidence } = require("../../utils/octopusKb/retrievalMerge");

    const result = mergeKbEvidence({
      kbItems: [
        {
          path: "kb/aaa-old.md",
          title: "Old",
          kind: "decision",
          created: "2026-06-01T00:00:00.000Z",
          text: "old memory",
          tokenEstimate: 1,
        },
        {
          path: "kb/zzz-new.md",
          title: "New",
          kind: "fact",
          created: "2026-06-15T00:00:00.000Z",
          text: "new memory",
          tokenEstimate: 1,
        },
      ],
      budget: 10,
      now: new Date("2026-06-16T00:00:00.000Z"),
      tokenizer: (text) => text.length,
    });

    expect(result.contextTexts).toEqual(["new memory", "old memory"]);
    expect(result.sources[0].metadata).toEqual(
      expect.objectContaining({
        kind: "fact",
        created: "2026-06-15T00:00:00.000Z",
      })
    );
  });

  it("keeps pinned open questions under budget pressure and reports typed rejections", () => {
    const { mergeKbEvidence } = require("../../utils/octopusKb/retrievalMerge");

    const result = mergeKbEvidence({
      kbItems: [
        {
          path: "kb/fresh.md",
          title: "Fresh",
          kind: "fact",
          created: "2026-06-15T00:00:00.000Z",
          text: "fresh",
          tokenEstimate: 5,
        },
        {
          path: "kb/open-question.md",
          title: "Open",
          kind: "open_question",
          created: "2026-01-01T00:00:00.000Z",
          text: "question",
          tokenEstimate: 5,
        },
        {
          path: "kb/old-fact.md",
          title: "Old Fact",
          kind: "fact",
          created: "2026-01-01T00:00:00.000Z",
          text: "old fact",
          tokenEstimate: 5,
        },
      ],
      budget: 10,
      now: new Date("2026-06-16T00:00:00.000Z"),
      tokenizer: (text) => text.length,
    });

    expect(result.sources.map((source) => source.path)).toEqual([
      "kb/open-question.md",
      "kb/fresh.md",
    ]);
    expect(result.metadata.rejections).toEqual([
      {
        path: "kb/old-fact.md",
        reason: "budget_exceeded",
        tokenEstimate: 5,
      },
    ]);
  });

  it("wraps retrieval with timeout/error fallback statuses", async () => {
    const {
      applyOctopusKbRetrieval,
    } = require("../../utils/octopusKb/retrievalMerge");

    const timeoutResult = await applyOctopusKbRetrieval({
      workspace: { slug: "demo" },
      query: "rag",
      contextTexts: ["vector"],
      sources: [],
      kbClient: {
        enabled: jest.fn(async () => true),
        isCircuitOpen: jest.fn(() => false),
        retrieveBundle: jest.fn(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
        ),
      },
      timeoutMs: 5,
    });
    expect(timeoutResult.metadata.status).toBe("timeout");
    expect(timeoutResult.contextTexts).toEqual(["vector"]);

    const errorResult = await applyOctopusKbRetrieval({
      workspace: { slug: "demo" },
      query: "rag",
      contextTexts: ["vector"],
      sources: [],
      kbClient: {
        enabled: jest.fn(async () => true),
        isCircuitOpen: jest.fn(() => false),
        retrieveBundle: jest.fn(async () => {
          throw new Error("boom");
        }),
      },
      timeoutMs: 50,
    });
    expect(errorResult.metadata.status).toBe("error");
    expect(errorResult.contextTexts).toEqual(["vector"]);
  });

  it("reports circuit_open without calling retrieveBundle", async () => {
    const {
      applyOctopusKbRetrieval,
    } = require("../../utils/octopusKb/retrievalMerge");
    const retrieveBundle = jest.fn();

    const result = await applyOctopusKbRetrieval({
      workspace: { slug: "demo" },
      query: "rag",
      contextTexts: ["vector"],
      sources: [],
      kbClient: {
        enabled: jest.fn(async () => true),
        isCircuitOpen: jest.fn(() => true),
        retrieveBundle,
      },
    });

    expect(result.metadata.status).toBe("circuit_open");
    expect(retrieveBundle).not.toHaveBeenCalled();
  });
});
