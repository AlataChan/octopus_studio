"use strict";

const { NoVideoProviderError } = require("./errors");

const PROVIDERS = {
  moonshot: {
    isConfigured: ({ apiKey }) => !!apiKey,
    build: (config) => {
      const { MoonshotVideoAdapter } = require("./moonshot");
      return new MoonshotVideoAdapter(config);
    },
  },
};

async function resolveVideoProviderConfig(providerName = null, overrides = {}) {
  const { SystemSettings } = require("../../models/systemSettings");
  const settings = await SystemSettings.videoUnderstandingSettings({
    maskApiKey: false,
  });
  const requestedProvider =
    providerName ||
    overrides.provider ||
    settings.provider ||
    process.env.VIDEO_PROVIDER ||
    "moonshot";
  const submittedApiKey = overrides.apiKey;
  const apiKey =
    submittedApiKey && !SystemSettings.isMaskedSecret(submittedApiKey)
      ? submittedApiKey
      : settings.apiKey || process.env.MOONSHOT_AI_API_KEY || null;

  return {
    provider: String(requestedProvider).toLowerCase(),
    apiKey,
    baseURL:
      overrides.baseURL ||
      overrides.baseUrl ||
      settings.baseUrl ||
      process.env.MOONSHOT_AI_BASE_URL,
    model:
      overrides.model ||
      settings.model ||
      process.env.MOONSHOT_AI_VIDEO_MODEL_PREF,
  };
}

async function hasVideoProvider(providerName = null, overrides = {}) {
  const config = await resolveVideoProviderConfig(providerName, overrides);
  const entry = PROVIDERS[config.provider];
  if (!entry) return false;
  return entry.isConfigured(config);
}

async function getVideoProvider(providerName = null, overrides = {}) {
  const config = await resolveVideoProviderConfig(providerName, overrides);
  const entry = PROVIDERS[config.provider];
  if (!entry || !entry.isConfigured(config)) {
    throw new NoVideoProviderError(
      `No video understanding provider is configured for "${config.provider}".`
    );
  }

  return entry.build(config);
}

module.exports = {
  getVideoProvider,
  hasVideoProvider,
  resolveVideoProviderConfig,
};
