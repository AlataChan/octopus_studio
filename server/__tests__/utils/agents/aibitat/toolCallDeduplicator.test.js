const ToolCallDeduplicator = require("../../../../utils/agents/aibitat/toolCallDeduplicator");

describe("ToolCallDeduplicator", () => {
  test("detects duplicates only after a previous matching call completed", () => {
    const deduplicator = new ToolCallDeduplicator();

    expect(
      deduplicator.check("web-search", { query: "hello", limit: 5 }, "tool-1")
    ).toEqual({ isDuplicate: false });

    expect(
      deduplicator.check("web-search", { limit: 5, query: "hello" }, "tool-2")
    ).toEqual({ isDuplicate: false });

    deduplicator.markCompleted("tool-1");

    expect(
      deduplicator.check("web-search", { query: "hello", limit: 5 }, "tool-3")
    ).toEqual({
      isDuplicate: true,
      previousToolUseId: "tool-1",
    });
  });

  test("discardIncomplete removes unfinished fingerprints so fallback can retry", () => {
    const deduplicator = new ToolCallDeduplicator();

    deduplicator.check("memory", { query: "alpha" }, "tool-a");
    deduplicator.check("memory", { query: "beta" }, "tool-b");
    deduplicator.markCompleted("tool-b");

    deduplicator.discardIncomplete();

    expect(deduplicator.check("memory", { query: "alpha" }, "tool-c")).toEqual({
      isDuplicate: false,
    });
    expect(deduplicator.check("memory", { query: "beta" }, "tool-d")).toEqual({
      isDuplicate: true,
      previousToolUseId: "tool-b",
    });
  });
});
