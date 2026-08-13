const {
  CONCURRENCY_SAFE_ALLOWLIST,
  executeBatches,
  isConcurrencySafe,
  partitionToolCalls,
  promisePool,
} = require("../../../../utils/agents/aibitat/toolOrchestration");

describe("toolOrchestration", () => {
  afterEach(() => {
    delete process.env.AGENT_MAX_TOOL_CONCURRENCY;
  });

  test("uses explicit concurrency metadata before the internal allowlist", () => {
    expect(
      isConcurrencySafe("web-search", { isConcurrencySafe: false })
    ).toBe(false);
    expect(
      isConcurrencySafe("custom-tool", { isConcurrencySafe: true })
    ).toBe(true);
    expect(CONCURRENCY_SAFE_ALLOWLIST.has("web-search")).toBe(true);
    expect(isConcurrencySafe("web-search", {})).toBe(true);
    expect(isConcurrencySafe("mcp.tool", {})).toBe(false);
  });

  test("partitions consecutive concurrency-safe calls into a shared batch", () => {
    const functions = new Map([
      ["web-search", { name: "web-search", isConcurrencySafe: true }],
      ["read-document-file", { name: "read-document-file", isConcurrencySafe: true }],
      ["write-file", { name: "write-file", isConcurrencySafe: false }],
      ["memory", { name: "memory", isConcurrencySafe: true }],
    ]);

    const batches = partitionToolCalls(
      [
        { name: "web-search", arguments: { q: "one" } },
        { name: "read-document-file", arguments: { path: "README.md" } },
        { name: "write-file", arguments: { path: "out.txt" } },
        { name: "memory", arguments: { query: "later" } },
      ],
      functions
    );

    expect(batches).toEqual([
      {
        concurrent: true,
        calls: [
          { name: "web-search", arguments: { q: "one" } },
          { name: "read-document-file", arguments: { path: "README.md" } },
        ],
      },
      {
        concurrent: false,
        calls: [{ name: "write-file", arguments: { path: "out.txt" } }],
      },
      {
        concurrent: true,
        calls: [{ name: "memory", arguments: { query: "later" } }],
      },
    ]);
  });

  test("executeBatches respects AGENT_MAX_TOOL_CONCURRENCY=1", async () => {
    process.env.AGENT_MAX_TOOL_CONCURRENCY = "1";
    const batches = [
      {
        concurrent: true,
        calls: [{ name: "web-search", arguments: 1 }, { name: "memory", arguments: 2 }],
      },
    ];

    const order = [];
    const results = await executeBatches(batches, async (call) => {
      order.push(`start:${call.arguments}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`end:${call.arguments}`);
      return call.arguments;
    });

    expect(results).toEqual([1, 2]);
    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);
  });

  test("promisePool preserves input ordering while running concurrently", async () => {
    const results = await promisePool([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value * 5));
      return value * 10;
    });

    expect(results).toEqual([30, 10, 20]);
  });
});
