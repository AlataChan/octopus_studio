const fs = require("fs");
const path = require("path");
const {
  INTEGRATION_SRC,
} = require("./KbClient");
const {
  OCTOPUS_KB_SETTINGS,
  getOctopusKbSetting,
  isOctopusKbEnabled,
  normalizeArgs,
} = require("./settings");

const MCP_SERVER_NAME = "octopus-kb";

function defaultMcpConfigPath() {
  if (process.env.NODE_ENV === "development") {
    return path.resolve(
      __dirname,
      "../../storage/plugins/anythingllm_mcp_servers.json"
    );
  }
  return path.resolve(
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage"),
    "plugins/anythingllm_mcp_servers.json"
  );
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) return { mcpServers: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return { mcpServers: {} };
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      parsed.mcpServers = {};
    }
    return parsed;
  } catch {
    return { mcpServers: {} };
  }
}

function writeConfig(configPath, config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

async function resolveOctopusKbMcpConfig({
  env = process.env,
  SystemSettingsModel,
} = {}) {
  const enabled = await isOctopusKbEnabled({ env, SystemSettingsModel });
  if (!enabled) return { enabled: false, server: null };

  const command = await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.command, {
    env,
    SystemSettingsModel,
  });
  if (!command) {
    return {
      enabled: true,
      server: null,
      reason: "missing_command",
    };
  }
  if (!path.isAbsolute(command)) {
    return {
      enabled: true,
      server: null,
      reason: "command_not_absolute",
    };
  }

  const args = normalizeArgs(
    await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.args, {
      env,
      SystemSettingsModel,
    })
  );
  const vaultRoot = path.resolve(
    await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.vaultRoot, {
      env,
      SystemSettingsModel,
    })
  );

  return {
    enabled: true,
    server: {
      command,
      args: [...args, "-m", "octopus_kb_mcp.server"],
      env: {
        OCTOPUS_KB_VAULT_ROOT: vaultRoot,
        PYTHONPATH: INTEGRATION_SRC,
      },
      anythingllm: {
        autoStart: false,
        managedBy: "octopus-kb",
      },
    },
  };
}

async function registerOctopusKbMcp({
  mcpConfigPath = defaultMcpConfigPath(),
  env = process.env,
  SystemSettingsModel,
} = {}) {
  const resolved = await resolveOctopusKbMcpConfig({
    env,
    SystemSettingsModel,
  });

  if (!resolved.enabled) {
    return { enabled: false, registered: false };
  }

  const config = readConfig(mcpConfigPath);

  if (!resolved.server) {
    writeConfig(mcpConfigPath, config);
    return {
      enabled: true,
      registered: false,
      reason: resolved.reason,
    };
  }

  config.mcpServers[MCP_SERVER_NAME] = resolved.server;
  writeConfig(mcpConfigPath, config);

  return {
    enabled: true,
    registered: true,
    serverName: MCP_SERVER_NAME,
    configPath: mcpConfigPath,
  };
}

async function registerOctopusKbMcpIfEnabled(options = {}) {
  try {
    return await registerOctopusKbMcp(options);
  } catch (error) {
    console.warn("[OctopusKB] MCP registration skipped:", error.message);
    return { enabled: false, registered: false, error: error.message };
  }
}

module.exports = {
  MCP_SERVER_NAME,
  defaultMcpConfigPath,
  registerOctopusKbMcp,
  registerOctopusKbMcpIfEnabled,
  resolveOctopusKbMcpConfig,
};
