const { AlataClient } = require("../../client/AlataClient");
const { getDbPath } = require("../../db");
const {
  getDataDir,
  getGatewayConfigMode,
  getManagedSnapshotPath,
  loadManagedSnapshot,
} = require("../../runtime/configStore");

function serializeYaml(value, indent = 0) {
  const padding = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const nested = serializeYaml(item, indent + 2)
            .split("\n")
            .map((line, index) => (index === 0 ? `- ${line}` : `${" ".repeat(indent + 2)}${line}`))
            .join("\n");
          return `${padding}${nested}`;
        }
        return `${padding}- ${String(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, nested]) => {
        if (nested && typeof nested === "object") {
          return `${padding}${key}:\n${serializeYaml(nested, indent + 2)}`;
        }
        return `${padding}${key}: ${nested === null ? "null" : String(nested)}`;
      })
      .join("\n");
  }

  if (value === null) return "null";
  return String(value);
}

function formatTable(record) {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join("\n");
}

function printPayload(payload, output, stdout) {
  if (output === "json") {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (output === "yaml") {
    stdout.write(`${serializeYaml(payload)}\n`);
    return;
  }

  stdout.write(`${formatTable(payload)}\n`);
}

async function doctorCommand(options = {}, streams = {}, deps = {}) {
  const env = options.env || process.env;
  const output = options.output || "table";
  const stdout = streams.stdout || process.stdout;
  const Client = deps.AlataClient || AlataClient;

  let alataReachable = null;
  const baseUrl = options.baseUrl || env.ALATA_BASE_URL || null;
  const apiKey = options.apiKey || env.ALATA_API_KEY || "";

  if (baseUrl) {
    try {
      const client = new Client({
        baseUrl,
        apiKey,
        internalSecret: options.internalSecret || env.ALATA_INTERNAL_SECRET || "",
        timeout: options.timeout || 5000,
      });
      alataReachable = await client.healthCheck();
    } catch {
      alataReachable = false;
    }
  }

  const snapshot = loadManagedSnapshot(env);
  const payload = {
    mode: getGatewayConfigMode(env),
    baseUrl,
    runtimeId: env.ALATA_GATEWAY_RUNTIME_ID || null,
    dataDir: getDataDir(env),
    dbPath: getDbPath(env),
    snapshotPath: getManagedSnapshotPath(env),
    hasSnapshot: !!snapshot,
    snapshotRevision: snapshot?.revision || null,
    alataReachable,
  };

  printPayload(payload, output, stdout);
  return 0;
}

module.exports = {
  doctorCommand,
};
