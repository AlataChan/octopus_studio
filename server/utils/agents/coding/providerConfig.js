const { PROVIDER_CAPABILITIES } = require("./codingModelAdapter");

const DEFAULT_PROVIDER = "fake";
const DEFAULT_MODELS = Object.freeze({
  fake: null,
  deepseek: "deepseek-chat",
});

function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function assertSupported(provider) {
  if (!PROVIDER_CAPABILITIES[provider]) {
    throw new Error(`Provider "${provider}" is not enabled for coding-agent tool calls`);
  }
}

function resolveProviderConfig({
  request = {},
  env = process.env,
  defaults = {},
} = {}) {
  const provider = normalizeProvider(
    request.provider ||
      env.CODING_AGENT_PROVIDER ||
      defaults.provider ||
      DEFAULT_PROVIDER
  );
  assertSupported(provider);
  const model =
    request.model ||
    env.CODING_AGENT_MODEL ||
    defaults.model ||
    DEFAULT_MODELS[provider] ||
    null;
  return { provider, model };
}

module.exports = {
  resolveProviderConfig,
};
