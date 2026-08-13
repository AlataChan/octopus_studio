const {
  applyHistoryCompaction,
  resolveCompactionConfig,
  sourceWindowLimit,
} = require("../historyCompaction");

function mkHistory(n) {
  const h = [];
  for (let i = 0; i < n; i++) {
    h.push(
      {
        from: "user",
        to: "workspace",
        content: `q${i} ${"x".repeat(400)}`,
        state: "success",
      },
      {
        from: "workspace",
        to: "user",
        content: `a${i} ${"y".repeat(400)}`,
        state: "success",
      }
    );
  }
  return h;
}

describe("historyCompaction", () => {
  it("sourceWindowLimit: flag off → default limit; on → larger window", () => {
    expect(sourceWindowLimit({ CONTEXT_COMPACTION_ENABLED: "false" }, 20)).toBe(
      20
    );
    expect(
      sourceWindowLimit(
        {
          CONTEXT_COMPACTION_ENABLED: "true",
          CONTEXT_COMPACTION_SOURCE_WINDOW: "100",
        },
        20
      )
    ).toBe(100);
  });

  it("sourceWindowLimit: clamps invalid/extreme env", () => {
    const on = (v) => ({
      CONTEXT_COMPACTION_ENABLED: "true",
      CONTEXT_COMPACTION_SOURCE_WINDOW: v,
    });
    expect(sourceWindowLimit(on("abc"), 20)).toBe(100);
    expect(sourceWindowLimit(on("0"), 20)).toBe(100);
    expect(sourceWindowLimit(on("5"), 20)).toBe(20);
    expect(sourceWindowLimit(on("99999"), 20)).toBe(500);
    expect(sourceWindowLimit(on("99999"), 600)).toBe(600);
  });

  it("resolveCompactionConfig: clamps budget/keepRecentTurns to safe positive ints", () => {
    expect(resolveCompactionConfig({})).toEqual({
      budgetTokens: 8000,
      keepRecentTurns: 4,
    });
    expect(
      resolveCompactionConfig({
        CONTEXT_COMPACTION_BUDGET_TOKENS: "0.5",
        CONTEXT_COMPACTION_KEEP_RECENT_TURNS: "abc",
      })
    ).toEqual({ budgetTokens: 8000, keepRecentTurns: 4 });
    expect(
      resolveCompactionConfig({
        CONTEXT_COMPACTION_BUDGET_TOKENS: "1500",
        CONTEXT_COMPACTION_KEEP_RECENT_TURNS: "3",
      })
    ).toEqual({ budgetTokens: 1500, keepRecentTurns: 3 });
  });

  it("flag off → returns history untouched (identity)", async () => {
    const h = mkHistory(30);
    const out = await applyHistoryCompaction(h, {
      CONTEXT_COMPACTION_ENABLED: "false",
    });
    expect(out).toBe(h);
  });

  it("flag on + long history → compacted, fewer messages, summary first, recent verbatim", async () => {
    const h = mkHistory(40);
    const out = await applyHistoryCompaction(h, {
      CONTEXT_COMPACTION_ENABLED: "true",
      CONTEXT_COMPACTION_BUDGET_TOKENS: "1500",
      CONTEXT_COMPACTION_KEEP_RECENT_TURNS: "3",
    });
    expect(out.length).toBeLessThan(h.length);
    expect(out[0]._compactionSummary).toBe(true);
    expect(out[out.length - 1]).toEqual(h[h.length - 1]);
  });

  it("flag on + short history → unchanged", async () => {
    const h = mkHistory(1);
    const out = await applyHistoryCompaction(h, {
      CONTEXT_COMPACTION_ENABLED: "true",
      CONTEXT_COMPACTION_BUDGET_TOKENS: "100000",
    });
    expect(out).toEqual(h);
  });
});
