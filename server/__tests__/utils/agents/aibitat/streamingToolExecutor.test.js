const ToolResult = require("../../../../utils/agents/aibitat/toolResult");
const StreamingToolExecutor = require("../../../../utils/agents/aibitat/streamingToolExecutor");

describe("StreamingToolExecutor", () => {
  afterEach(() => {
    delete process.env.AGENT_MAX_TOOL_CONCURRENCY;
  });

  test("getResults preserves input order and respects serial barriers", async () => {
    const functions = new Map([
      ["web-search", { name: "web-search", isConcurrencySafe: true }],
      ["memory", { name: "memory", isConcurrencySafe: true }],
      ["write-file", { name: "write-file", isConcurrencySafe: false }],
      ["read-document-file", { name: "read-document-file", isConcurrencySafe: true }],
    ]);
    const order = [];
    const executor = new StreamingToolExecutor(
      functions,
      async (call, toolUseId) => {
        order.push(`start:${toolUseId}`);
        await new Promise((resolve) =>
          setTimeout(resolve, call.name === "web-search" ? 20 : 5)
        );
        order.push(`end:${toolUseId}`);
        return ToolResult.success(toolUseId, call.name, `${call.name}:ok`);
      },
      { maxConcurrency: 2 }
    );

    executor.addTool({ name: "web-search", arguments: { query: "alpha" } }, "tool-1");
    executor.addTool({ name: "memory", arguments: { query: "beta" } }, "tool-2");
    executor.addTool({ name: "write-file", arguments: { path: "out.txt" } }, "tool-3");
    executor.addTool(
      { name: "read-document-file", arguments: { path: "README.md" } },
      "tool-4"
    );

    const results = await executor.getResults();

    expect(results.map((result) => result.toolUseId)).toEqual([
      "tool-1",
      "tool-2",
      "tool-3",
      "tool-4",
    ]);
    expect(order).toEqual([
      "start:tool-1",
      "start:tool-2",
      "end:tool-2",
      "end:tool-1",
      "start:tool-3",
      "end:tool-3",
      "start:tool-4",
      "end:tool-4",
    ]);
  });

  test("discard marks unfinished tools as discarded and skips them from results", async () => {
    let release;
    const executor = new StreamingToolExecutor(
      new Map([["memory", { name: "memory", isConcurrencySafe: true }]]),
      async (call, toolUseId) => {
        if (call.arguments.query === "slow") {
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return ToolResult.success(toolUseId, call.name, call.arguments.query);
      },
      { maxConcurrency: 1 }
    );

    executor.addTool({ name: "memory", arguments: { query: "slow" } }, "tool-1");
    executor.addTool({ name: "memory", arguments: { query: "later" } }, "tool-2");

    executor.discard("streaming_fallback");
    release();

    const results = await executor.getResults();

    expect(results).toEqual([]);
    expect(executor.tools.map((tool) => tool.status)).toEqual([
      "discarded",
      "discarded",
    ]);
    expect(executor.tools.map((tool) => tool.result.type)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(executor.stats.discarded).toBe(2);
  });

  test("does not add the same toolUseId twice and discards queued siblings after an error", async () => {
    const executor = new StreamingToolExecutor(
      new Map([["memory", { name: "memory", isConcurrencySafe: true }]]),
      async (call, toolUseId) => {
        if (call.arguments.query === "bad") {
          return ToolResult.inputError(toolUseId, call.name, "tool exploded");
        }
        return ToolResult.success(toolUseId, call.name, call.arguments.query);
      },
      { maxConcurrency: 1 }
    );

    executor.addTool({ name: "memory", arguments: { query: "bad" } }, "tool-1");
    executor.addTool({ name: "memory", arguments: { query: "bad" } }, "tool-1");
    executor.addTool({ name: "memory", arguments: { query: "later" } }, "tool-2");

    const results = await executor.getResults();

    expect(executor.tools).toHaveLength(2);
    expect(results.map((result) => result.toolUseId)).toEqual(["tool-1"]);
    expect(executor.tools.find((tool) => tool.toolUseId === "tool-2")).toMatchObject({
      status: "discarded",
      result: expect.objectContaining({ type: "cancelled" }),
    });
  });
});
