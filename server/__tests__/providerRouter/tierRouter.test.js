const mockGetValueOrFallback = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: (...args) => mockGetValueOrFallback(...args),
  },
}));

describe("cost-tier route resolution", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    return require("../../utils/AiProviders/providerRouter/tierRouter");
  }

  test("validateTierMap accepts chat factory keys and rejects azure-openai", () => {
    const { validateTierMap } = loadRouter();

    expect(
      validateTierMap(
        {
          C0: { provider: "azure", model: "gpt-4o-mini" },
          C1: { provider: "openai", model: "gpt-4o-mini" },
          C2: { provider: "anthropic", model: "claude" },
          C3: { provider: "hireagent", model: "premium" },
        },
        { mode: "chat" }
      )
    ).toEqual({
      ok: true,
      map: {
        C0: { provider: "azure", model: "gpt-4o-mini" },
        C1: { provider: "openai", model: "gpt-4o-mini" },
        C2: { provider: "anthropic", model: "claude" },
        C3: { provider: "hireagent", model: "premium" },
      },
    });

    const rejected = validateTierMap(
      { C0: { provider: "azure-openai", model: "gpt-4o-mini" } },
      { mode: "chat" }
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join(" ")).toMatch(/azure-openai/);
  });

  test("validateTierMap employee mode uses the chat factory and AIbitat intersection", () => {
    const { validateTierMap } = loadRouter();

    expect(
      validateTierMap(
        {
          C0: { provider: "openai", model: "gpt-4o-mini" },
          C1: { provider: "azure", model: "gpt-4o" },
          C2: { provider: "generic-openai", model: "x" },
          C3: { provider: "moonshotai", model: "moonshot" },
        },
        { mode: "employee" }
      ).ok
    ).toBe(true);

    for (const provider of [
      "zhipu",
      "minimax",
      "siliconflow",
      "hireagent",
      "groq",
    ]) {
      const result = validateTierMap(
        { C0: { provider, model: "x" } },
        { mode: "employee" }
      );
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain(provider);
    }
  });

  test("short-circuits to null when the global flag is disabled", async () => {
    mockGetValueOrFallback.mockResolvedValueOnce("false");
    const { resolveTieredRoute } = loadRouter();

    await expect(
      resolveTieredRoute({
        workspace: { id: 1, chatProvider: "openai", chatModel: "gpt-4o" },
        message: "simple",
      })
    ).resolves.toBeNull();
    expect(mockGetValueOrFallback).toHaveBeenCalledTimes(1);
  });

  test("short-circuits to null when the workspace opted out", async () => {
    mockGetValueOrFallback.mockResolvedValueOnce("true");
    const { resolveTieredRoute } = loadRouter();

    await expect(
      resolveTieredRoute({
        workspace: {
          id: 1,
          chatProvider: "openai",
          chatModel: "gpt-4o",
          disableTierRouting: true,
        },
        message: "simple",
      })
    ).resolves.toBeNull();
  });

  test("returns the mapped provider and model for the scored tier", async () => {
    mockGetValueOrFallback
      .mockResolvedValueOnce("true")
      .mockResolvedValueOnce(
        JSON.stringify({
          C0: { provider: "openai", model: "gpt-4o-mini" },
          C1: { provider: "openai", model: "gpt-4o-mini" },
          C2: { provider: "anthropic", model: "claude-sonnet" },
          C3: { provider: "openai", model: "gpt-4o" },
        })
      );
    const { resolveTieredRoute } = loadRouter();

    const route = await resolveTieredRoute({
      workspace: { id: 1, chatProvider: "openai", chatModel: "gpt-4o" },
      message:
        "Implement a distributed scheduler with retries, leases, idempotency, and rollback.",
    });

    expect(route).toEqual(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4o",
        tier: "C3",
        source: "model_tier_map",
      })
    );
  });

  test("never throws when settings or maps are malformed", async () => {
    mockGetValueOrFallback
      .mockResolvedValueOnce("true")
      .mockResolvedValueOnce("{not-json");
    const { resolveTieredRoute } = loadRouter();

    await expect(
      resolveTieredRoute({
        workspace: { id: 1, chatProvider: "openai", chatModel: "gpt-4o" },
        message: "anything",
      })
    ).resolves.toBeNull();
  });
});
