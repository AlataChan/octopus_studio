const { SystemSettings } = require("../../../models/systemSettings");
const { scoreComplexity, TIERS } = require("./complexity");

const CHAT_PROVIDER_KEYS = Object.freeze([
  "openai",
  "azure",
  "anthropic",
  "gemini",
  "lmstudio",
  "ollama",
  "openrouter",
  "generic-openai",
  "aihubmix",
  "deepseek",
  "moonshotai",
  "zhipu",
  "minimax",
  "siliconflow",
  "hireagent",
]);

const EMPLOYEE_PROVIDER_KEYS = Object.freeze([
  "openai",
  "azure",
  "anthropic",
  "gemini",
  "openrouter",
  "generic-openai",
  "aihubmix",
  "deepseek",
  "moonshotai",
  "lmstudio",
  "ollama",
]);

const TIER_ROUTING_ENABLED_LABEL = "model_tier_routing_enabled";
const TIER_MAP_LABEL = "model_tier_map";

function isEnabled(value) {
  if (value === true) return true;
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseTierMap(rawJson) {
  if (!rawJson) return {};
  if (typeof rawJson === "object" && !Array.isArray(rawJson)) return rawJson;
  return JSON.parse(String(rawJson));
}

function validateTierMap(rawJson, { mode = "chat" } = {}) {
  const allowedProviders =
    mode === "employee" ? EMPLOYEE_PROVIDER_KEYS : CHAT_PROVIDER_KEYS;
  const errors = [];
  let parsed;

  try {
    parsed = parseTierMap(rawJson);
  } catch (error) {
    return { ok: false, errors: [`model_tier_map must be valid JSON: ${error.message}`] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: ["model_tier_map must be an object"] };
  }

  const map = {};
  for (const [tier, config] of Object.entries(parsed)) {
    if (!TIERS.includes(tier)) {
      errors.push(`${tier} is not a valid tier`);
      continue;
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      errors.push(`${tier} must be an object with provider and model`);
      continue;
    }

    const provider = String(config.provider || "").trim();
    const model = String(config.model || "").trim();
    if (!provider) errors.push(`${tier}.provider is required`);
    if (!model) errors.push(`${tier}.model is required`);
    if (provider && !allowedProviders.includes(provider)) {
      errors.push(`${tier}.provider ${provider} is not allowed for ${mode} mode`);
    }
    if (provider && model && allowedProviders.includes(provider)) {
      map[tier] = { provider, model };
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, map };
}

async function resolveTieredRoute({
  workspace,
  message,
  history = [],
  attachments = [],
} = {}) {
  try {
    const enabled = await SystemSettings.getValueOrFallback(
      { label: TIER_ROUTING_ENABLED_LABEL },
      "false"
    );
    if (!isEnabled(enabled)) return null;
    if (workspace?.disableTierRouting === true) return null;

    const rawMap = await SystemSettings.getValueOrFallback(
      { label: TIER_MAP_LABEL },
      "{}"
    );
    const validation = validateTierMap(rawMap, { mode: "chat" });
    if (!validation.ok) return null;

    const complexity = scoreComplexity({ message, history, attachments });
    const route = validation.map[complexity.tier];
    if (!route) return null;

    return {
      provider: route.provider,
      model: route.model,
      tier: complexity.tier,
      score: complexity.score,
      features: complexity.features,
      source: TIER_MAP_LABEL,
    };
  } catch {
    return null;
  }
}

module.exports = {
  CHAT_PROVIDER_KEYS,
  EMPLOYEE_PROVIDER_KEYS,
  TIER_ROUTING_ENABLED_LABEL,
  TIER_MAP_LABEL,
  validateTierMap,
  resolveTieredRoute,
};
