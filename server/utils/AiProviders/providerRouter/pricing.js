const TIER_PRICING = Object.freeze({
  openai: Object.freeze({
    "gpt-4o-mini": Object.freeze({
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
    }),
    "gpt-4o": Object.freeze({
      inputUsdPer1M: 5,
      outputUsdPer1M: 15,
    }),
  }),
});

function pricingFor(provider, model) {
  if (provider === "deterministic") {
    return { inputUsdPer1M: 0, outputUsdPer1M: 0, source: "local-test" };
  }

  const knownPricing = TIER_PRICING[provider]?.[model];
  if (knownPricing) {
    return {
      ...knownPricing,
      source: "known-pricing",
    };
  }

  return {
    inputUsdPer1M: null,
    outputUsdPer1M: null,
    source: "unknown-provider-default",
  };
}

module.exports = {
  TIER_PRICING,
  pricingFor,
};
