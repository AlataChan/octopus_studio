const fs = require("fs");
const os = require("os");
const path = require("path");

function loadCostMeter() {
  return require("../../../../utils/agents/coding/costMeter");
}

function loadProviderConfig() {
  return require("../../../../utils/agents/coding/providerConfig");
}

function loadCleanup() {
  return require("../../../../utils/agents/coding/sandboxCleanup");
}

function loadLoop() {
  return require("../../../../utils/agents/coding/codingAgentLoop");
}

function makeDir(root, name, sizeBytes = 1) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "payload.bin"), Buffer.alloc(sizeBytes, 1));
  return dir;
}

describe("coding agent M4 cost, provider, and cleanup hardening", () => {
  test("T-CB1 costMeter computes USD, returns null for unknown price, and warns on invalid budgets", () => {
    const { computeUsageCostUsd, parseBudgetUsd } = loadCostMeter();
    expect(
      computeUsageCostUsd({
        provider: "deepseek",
        model: "deepseek-chat",
        usage: { prompt_tokens: 1000, completion_tokens: 2000 },
        priceTable: {
          deepseek: {
            "deepseek-chat": { inputPerMillion: 0.25, outputPerMillion: 0.5 },
          },
        },
      })
    ).toBeCloseTo(0.00125);
    expect(
      computeUsageCostUsd({
        provider: "ollama",
        model: "local",
        usage: { prompt_tokens: 1000, completion_tokens: 1000 },
        priceTable: {},
      })
    ).toBeNull();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseBudgetUsd({ CODING_AGENT_MAX_BUDGET_USD: "-1" })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("T-CB2 loop stops with budget_exceeded when known cost exceeds cap; unknown cost still falls back to max_turns", async () => {
    const { CodingAgentLoop } = loadLoop();
    const knownLoop = new CodingAgentLoop({
      costMeter: {
        addUsage: () => ({ totalCostUsd: 0.02, budgetExceeded: true }),
      },
      modelAdapter: {
        async *stream() {
          yield { type: "usage", usage: { prompt_tokens: 1000, completion_tokens: 1000 } };
          yield { type: "stop_reason", stop_reason: "end_turn" };
        },
      },
      toolRuntime: { executeToolUse: jest.fn() },
      maxTurns: 5,
    });
    await expect(knownLoop.run("fix")).resolves.toMatchObject({
      status: "failed",
      reason: "budget_exceeded",
      totalCostUsd: 0.02,
    });

    const unknownLoop = new CodingAgentLoop({
      costMeter: {
        addUsage: () => ({ totalCostUsd: null, budgetExceeded: false }),
      },
      modelAdapter: {
        async *stream() {
          yield { type: "tool_use", id: "tool-1", name: "code_status", input: {} };
          yield { type: "stop_reason", stop_reason: "tool_use" };
        },
      },
      toolRuntime: {
        executeToolUse: async (toolUse) => ({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "{}",
          is_error: false,
        }),
      },
      maxTurns: 2,
    });
    await expect(unknownLoop.run("fix")).resolves.toMatchObject({ status: "max_turns" });
  });

  test("T-PR1 providerConfig resolves request > env > default and unsupported providers fail closed", () => {
    const { resolveProviderConfig } = loadProviderConfig();
    expect(
      resolveProviderConfig({
        request: { provider: "deepseek", model: "deepseek-chat" },
        env: { CODING_AGENT_PROVIDER: "fake", CODING_AGENT_MODEL: "fake-model" },
      })
    ).toEqual({ provider: "deepseek", model: "deepseek-chat" });
    expect(
      resolveProviderConfig({
        request: {},
        env: { CODING_AGENT_PROVIDER: "deepseek", CODING_AGENT_MODEL: "deepseek-chat" },
      })
    ).toEqual({ provider: "deepseek", model: "deepseek-chat" });
    expect(() =>
      resolveProviderConfig({ request: { provider: "anthropic", model: "expensive" } })
    ).toThrow(/not enabled/i);
  });

  test("T-CL1 sandboxCleanup removes old or oversized sandboxes but never running or awaiting approval", async () => {
    const { cleanupSandboxes } = loadCleanup();
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-cleanup-"));
    try {
      const running = makeDir(storageRoot, "run-running", 50);
      const awaiting = makeDir(storageRoot, "run-awaiting", 50);
      const oldApplied = makeDir(storageRoot, "run-old-applied", 50);
      const oldUnapplied = makeDir(storageRoot, "run-old-unapplied", 50);
      const now = 10_000;
      const old = new Date(now - 5_000);
      for (const dir of [running, awaiting, oldApplied, oldUnapplied]) {
        fs.utimesSync(dir, old, old);
      }
      const repository = {
        getRunForSandbox: async (sandboxPath) => {
          if (sandboxPath === running) return { status: "running" };
          if (sandboxPath === awaiting) return { status: "awaiting_approval" };
          if (sandboxPath === oldApplied) return { status: "completed", appliedAt: now - 4_000 };
          return { status: "completed", appliedAt: null, completedAt: now - 1_000 };
        },
      };

      const result = await cleanupSandboxes({
        storageRoot,
        repository,
        now: () => now,
        ttlMs: 1_000,
        unappliedTtlMs: 10_000,
        maxTotalBytes: 10_000,
      });

      expect(result.removed).toContain(oldApplied);
      expect(result.removed).not.toContain(running);
      expect(result.removed).not.toContain(awaiting);
      expect(result.removed).not.toContain(oldUnapplied);
      expect(fs.existsSync(running)).toBe(true);
      expect(fs.existsSync(awaiting)).toBe(true);
      expect(fs.existsSync(oldApplied)).toBe(false);
      expect(fs.existsSync(oldUnapplied)).toBe(true);
    } finally {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});
