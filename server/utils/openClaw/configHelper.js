const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DEFAULT_GATEWAY_PORT = 18790;

function getConfigDir() {
  return path.join(os.homedir(), ".openclaw");
}

function getConfigPath() {
  return path.join(getConfigDir(), "openclaw.alata.json");
}

function readConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch {
    // 配置文件损坏，重建
  }
  return {
    gateway: { port: DEFAULT_GATEWAY_PORT, authToken: "" },
    llm: {},
    _source: "alata-studio",
  };
}

function writeConfig(config) {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  // Ensure permissions on pre-existing files are corrected
  try {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Non-fatal: Windows or permission-restricted environments
  }
}

function syncProviderConfig(providerInfo = {}) {
  const config = readConfig();
  const authToken =
    config?.gateway?.authToken || crypto.randomBytes(32).toString("hex");

  config.gateway = {
    port: config.gateway?.port || DEFAULT_GATEWAY_PORT,
    authToken,
  };
  config.llm = {
    provider: providerInfo.provider || "",
    model: providerInfo.model || "",
    apiKey: providerInfo.apiKey || "",
    apiBase: providerInfo.apiBase || "",
    updatedAt: new Date().toISOString(),
  };

  writeConfig(config);
  return { authToken, port: config.gateway.port };
}

function updateGatewayPort(port = DEFAULT_GATEWAY_PORT) {
  const config = readConfig();
  config.gateway = {
    ...(config.gateway || {}),
    port: Number(port) || DEFAULT_GATEWAY_PORT,
    authToken: config?.gateway?.authToken || "",
  };
  writeConfig(config);
  return config.gateway.port;
}

function getDashboardUrl() {
  const config = readConfig();
  const port = config.gateway?.port || DEFAULT_GATEWAY_PORT;
  const token = config.gateway?.authToken || "";
  return `http://localhost:${port}${token ? `?token=${token}` : ""}`;
}

module.exports = {
  DEFAULT_GATEWAY_PORT,
  getConfigDir,
  getConfigPath,
  readConfig,
  writeConfig,
  syncProviderConfig,
  updateGatewayPort,
  getDashboardUrl,
};
