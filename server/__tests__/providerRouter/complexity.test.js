const {
  scoreComplexity,
} = require("../../utils/AiProviders/providerRouter/complexity");

describe("cost-tier complexity scoring", () => {
  test.each([
    ["hi", "C0"],
    ["thanks", "C0"],
    ["What is 2+2?", "C0"],
    ["你好", "C0"],
    ["天气怎么样？", "C0"],
    ["Summarize this sentence in plain English.", "C1"],
    ["Translate this short phrase to Spanish.", "C1"],
    ["帮我把这句话改得更礼貌。", "C1"],
    ["Write a short email asking for a refund.", "C1"],
    ["Give me three title ideas for a project update.", "C1"],
    ["Explain why this API sometimes returns 409 and list fixes.", "C2"],
    ["Compare Redis streams with Kafka for a small team.", "C2"],
    ["写一个 SQL 查询统计每月活跃用户。", "C2"],
    ["Debug this JavaScript stack trace and propose a fix.", "C2"],
    ["Create a migration plan with risks, rollout, and rollback.", "C2"],
    [
      "Implement a distributed scheduler with retries, leases, idempotency, metrics, and failure recovery.",
      "C3",
    ],
    [
      "Analyze this architecture, find race conditions, propose tests, and write pseudocode for each subsystem.",
      "C3",
    ],
    [
      "请分步骤设计一个多租户权限系统，包含威胁建模、数据迁移、回滚方案和测试矩阵。",
      "C3",
    ],
    [
      "Here is a long request: " + "reason about tradeoffs ".repeat(80),
      "C3",
    ],
    [
      "Review this code and explain the bug:\n```js\nfunction f(x){return x.map(y=>y.id).join(',')}\n```",
      "C2",
    ],
  ])("%s -> %s", (message, expectedTier) => {
    const result = scoreComplexity({ message });

    expect(result.tier).toBe(expectedTier);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.reason).toEqual(expect.any(String));
  });

  test("uses history and attachments as deterministic complexity signals", () => {
    const base = scoreComplexity({ message: "Explain this" });
    const enriched = scoreComplexity({
      message: "Explain this",
      history: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: `turn ${index}`,
      })),
      attachments: [
        { name: "trace.log", mime: "text/plain", contentString: "abc" },
      ],
    });

    expect(enriched.score).toBeGreaterThan(base.score);
    expect(enriched.features.historyDepth).toBeGreaterThan(0);
    expect(enriched.features.attachmentSignal).toBeGreaterThan(0);
  });

  test("is pure and deterministic for identical inputs", () => {
    const input = {
      message: "Compare three database options and explain the risks.",
      history: [{ role: "user", content: "previous turn" }],
      attachments: [{ name: "diagram.png", mime: "image/png" }],
    };

    expect(scoreComplexity(input)).toEqual(scoreComplexity(input));
  });
});
