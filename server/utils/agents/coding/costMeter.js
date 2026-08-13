const DEFAULT_PRICE_TABLE = Object.freeze({
  deepseek: {
    "deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  },
});

function usageTokens(usage = {}) {
  return {
    input:
      Number(usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0) || 0,
    output:
      Number(
        usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0
      ) || 0,
  };
}

function computeUsageCostUsd({
  provider,
  model,
  usage = {},
  priceTable = DEFAULT_PRICE_TABLE,
} = {}) {
  const price = priceTable?.[provider]?.[model];
  if (!price) return null;
  const tokens = usageTokens(usage);
  return (
    (tokens.input / 1_000_000) * Number(price.inputPerMillion || 0) +
    (tokens.output / 1_000_000) * Number(price.outputPerMillion || 0)
  );
}

function parseBudgetUsd(env = process.env) {
  const raw = env.CODING_AGENT_MAX_BUDGET_USD;
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.warn("Ignoring invalid CODING_AGENT_MAX_BUDGET_USD; max-turns remains the hard stop.");
    return null;
  }
  return value;
}

class CostMeter {
  constructor({
    provider,
    model,
    priceTable = DEFAULT_PRICE_TABLE,
    budgetUsd = parseBudgetUsd(),
  } = {}) {
    this.provider = provider;
    this.model = model;
    this.priceTable = priceTable;
    this.budgetUsd = budgetUsd;
    this.totalCostUsd = 0;
    this.unknownCost = false;
  }

  addUsage(usage = {}) {
    const cost = computeUsageCostUsd({
      provider: this.provider,
      model: this.model,
      usage,
      priceTable: this.priceTable,
    });
    if (cost == null) {
      this.unknownCost = true;
      return { totalCostUsd: null, budgetExceeded: false };
    }
    this.totalCostUsd += cost;
    return {
      totalCostUsd: this.totalCostUsd,
      budgetExceeded:
        this.budgetUsd != null && this.totalCostUsd > Number(this.budgetUsd),
    };
  }
}

module.exports = {
  CostMeter,
  DEFAULT_PRICE_TABLE,
  computeUsageCostUsd,
  parseBudgetUsd,
};
