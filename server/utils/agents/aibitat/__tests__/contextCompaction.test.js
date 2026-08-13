const {
  summarizeTurns,
  compactHistory,
  totalTokens,
} = require("../contextCompaction");

function turn(i) {
  return [
    {
      from: "user",
      to: "workspace",
      content: `用户问题 ${i} ${"详细内容".repeat(40)}`,
      state: "success",
    },
    {
      from: "workspace",
      to: "user",
      content: `助手回答 ${i} ${"解释说明".repeat(40)}`,
      state: "success",
    },
  ];
}
const longHistory = Array.from({ length: 20 }, (_, i) => turn(i)).flat();

describe("contextCompaction", () => {
  it("summarizeTurns: compressed non-empty string smaller than input", () => {
    const s = summarizeTurns(longHistory);
    const inputLen = longHistory.map((m) => m.content).join("").length;
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThan(inputLen);
  });

  it("compactHistory: under budget → unchanged passthrough", () => {
    const small = turn(0);
    const out = compactHistory(small, {
      budgetTokens: 100000,
      keepRecentTurns: 4,
    });
    expect(out.compacted).toBe(false);
    expect(out.messages).toBe(small);
  });

  it("compactHistory: over budget → summary first + recent verbatim + tokensAfter <= budget", () => {
    const budget = 800;
    const out = compactHistory(longHistory, {
      budgetTokens: budget,
      keepRecentTurns: 3,
    });
    expect(out.compacted).toBe(true);
    expect(out.messages[0]._compactionSummary).toBe(true);
    expect(out.messages[0].content).toContain("[历史摘要]");
    const last = out.messages[out.messages.length - 1];
    expect(last).toEqual(longHistory[longHistory.length - 1]);
    expect(out.tokensAfter).toBeLessThanOrEqual(budget);
    expect(out.tokensAfter).toBeLessThan(out.tokensBefore);
  });

  it("compactHistory: exact recent budget does not prepend empty summary", () => {
    const older = [
      {
        from: "user",
        to: "workspace",
        content: "older context that must be removed",
        state: "success",
      },
    ];
    const recent = [
      { from: "user", to: "workspace", content: "x", state: "success" },
      { from: "workspace", to: "user", content: "y", state: "success" },
    ];
    const budget = totalTokens(recent);
    const out = compactHistory([...older, ...recent], {
      budgetTokens: budget,
      keepRecentTurns: 1,
    });

    expect(out.compacted).toBe(true);
    expect(out.messages).toEqual(recent);
    expect(out.tokensAfter).toBeLessThanOrEqual(budget);
  });

  it("compactHistory: tiny budget still bounded (graceful degrade)", () => {
    const out = compactHistory(longHistory, {
      budgetTokens: 120,
      keepRecentTurns: 3,
    });
    expect(out.compacted).toBe(true);
    expect(out.tokensAfter).toBeLessThanOrEqual(120);
  });
});
