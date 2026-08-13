const { SystemSettings } = require("../../models/systemSettings");
const { MoltClient } = require("./client");
const { readMoltToken } = require("./tokenSource");

const SETTINGS = [
  "MOLT_BASE_URL",
  "MOLT_API_TOKEN_FILE",
  "MOLT_TOKEN_FILE",
  "MOLT_API_TOKEN",
  "MOLT_ADMIN_TOKEN",
  "MOLT_DASHBOARD_URL",
  "MOLT_ENABLED",
];

async function syncEnvToSystemSettings({
  systemSettings = SystemSettings,
} = {}) {
  try {
    const updates = {};

    for (const label of SETTINGS) {
      const value = process.env[label];
      if (!value || !String(value).trim()) continue;

      const existing = await systemSettings.get({ label });
      if (existing?.value) continue;
      updates[label] = String(value).trim();
    }

    if (Object.keys(updates).length === 0) return { synced: 0 };

    await systemSettings._updateSettings(updates);
    return { synced: Object.keys(updates).length };
  } catch (error) {
    console.warn("[MoltBootstrap] env sync skipped:", error.message);
    return { synced: 0, error: error.message };
  }
}

async function getSettingOrEnv(
  label,
  fallback = null,
  systemSettings = SystemSettings
) {
  try {
    const value = await systemSettings.getValueOrFallback?.({ label }, null);
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  } catch {
    // fallback below
  }

  const envValue = process.env[label];
  if (envValue !== undefined && envValue !== null && String(envValue).trim()) {
    return String(envValue).trim();
  }

  return fallback;
}

async function createMoltClientFromSettings({
  systemSettings = SystemSettings,
} = {}) {
  const enabled = await getSettingOrEnv(
    "MOLT_ENABLED",
    "false",
    systemSettings
  );
  if (enabled !== "true") return null;

  const baseUrl = await getSettingOrEnv("MOLT_BASE_URL", null, systemSettings);
  if (!baseUrl) return null;

  const apiTokenFile = await getSettingOrEnv(
    "MOLT_API_TOKEN_FILE",
    null,
    systemSettings
  );
  const legacyTokenFile = await getSettingOrEnv(
    "MOLT_TOKEN_FILE",
    null,
    systemSettings
  );
  const configuredToken = await getSettingOrEnv(
    "MOLT_API_TOKEN",
    null,
    systemSettings
  );
  const tokenFile = apiTokenFile || legacyTokenFile;

  const client = new MoltClient({
    baseUrl,
    getToken: async () => {
      if (configuredToken) return configuredToken;
      return readMoltToken({
        filePath: tokenFile,
        envName: "MOLT_API_TOKEN",
      });
    },
  });
  client.tokenReloadOptions = {
    filePath: tokenFile,
    envName: "MOLT_API_TOKEN",
  };
  return client;
}

module.exports = {
  syncEnvToSystemSettings,
  createMoltClientFromSettings,
};
