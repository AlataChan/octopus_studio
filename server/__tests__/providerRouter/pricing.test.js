describe("cost-tier pricing table", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("exposes known OpenAI pricing with the legacy return shape", () => {
    const {
      TIER_PRICING,
      pricingFor,
    } = require("../../utils/AiProviders/providerRouter/pricing");

    expect(TIER_PRICING.openai["gpt-4o-mini"]).toEqual({
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
    });
    expect(TIER_PRICING.openai["gpt-4o"]).toEqual({
      inputUsdPer1M: 5,
      outputUsdPer1M: 15,
    });
    expect(pricingFor("openai", "gpt-4o-mini")).toEqual({
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
      source: "known-pricing",
    });
  });

  test("keeps deterministic and unknown provider fallbacks byte-compatible", () => {
    const {
      pricingFor,
    } = require("../../utils/AiProviders/providerRouter/pricing");

    expect(pricingFor("deterministic", "work-agent-deterministic")).toEqual({
      inputUsdPer1M: 0,
      outputUsdPer1M: 0,
      source: "local-test",
    });
    expect(pricingFor("generic-openai", "custom")).toEqual({
      inputUsdPer1M: null,
      outputUsdPer1M: null,
      source: "unknown-provider-default",
    });
  });

  test("work-agent model router delegates pricing without changing route shape", async () => {
    jest.doMock("../../utils/workAgent/settings", () => ({
      WORK_AGENT_SETTINGS: { provider: "ALATA_WORK_AGENT_PROVIDER" },
      getWorkAgentSetting: jest.fn(async () => "deterministic"),
    }));
    const { buildProviderRoute } = require("../../utils/workAgent/modelRouter");

    const route = await buildProviderRoute();

    expect(route.pricing).toEqual({
      inputUsdPer1M: 0,
      outputUsdPer1M: 0,
      source: "local-test",
    });
  });
});
