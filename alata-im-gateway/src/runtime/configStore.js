const fs = require("node:fs");
const path = require("node:path");

function getDataDir(env = process.env) {
  return path.resolve(env.GATEWAY_DATA_DIR || path.resolve(__dirname, "../../data"));
}

function getManagedSnapshotPath(env = process.env) {
  return path.join(getDataDir(env), "managed-config.snapshot.json");
}

function getGatewayConfigMode(env = process.env) {
  const explicit = String(env.GATEWAY_CONFIG_MODE || "").trim().toLowerCase();
  if (explicit === "managed" || explicit === "standalone") return explicit;

  if (
    env.ALATA_GATEWAY_RUNTIME_ID ||
    env.ALATA_GATEWAY_RUNTIME_TOKEN ||
    env.ALATA_GATEWAY_BOOTSTRAP_TOKEN
  ) {
    return "managed";
  }

  return "standalone";
}

function ensureDataDir(env = process.env) {
  fs.mkdirSync(getDataDir(env), { recursive: true });
}

function loadManagedSnapshot(env = process.env) {
  const snapshotPath = getManagedSnapshotPath(env);
  if (!fs.existsSync(snapshotPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch {
    return null;
  }
}

function saveManagedSnapshot(snapshot, env = process.env) {
  ensureDataDir(env);
  const snapshotPath = getManagedSnapshotPath(env);
  const payload = {
    cachedAt: new Date().toISOString(),
    revision: snapshot?.revision || null,
    etag: snapshot?.etag || null,
    generatedAt: snapshot?.generatedAt || new Date().toISOString(),
    config: snapshot?.config || {
      runtime: null,
      accounts: [],
      bindings: [],
      policy: {},
    },
  };
  fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2));
  return payload;
}

function loadManagedAccounts(env = process.env) {
  const snapshot = loadManagedSnapshot(env);
  return Array.isArray(snapshot?.config?.accounts) ? snapshot.config.accounts : [];
}

function loadManagedBindings(env = process.env) {
  const snapshot = loadManagedSnapshot(env);
  const bindings = Array.isArray(snapshot?.config?.bindings)
    ? snapshot.config.bindings
    : [];

  return bindings.map((binding) => ({
    id: binding.id,
    enabled: binding.enabled !== false,
    channel: binding.channel || binding.provider,
    provider: binding.provider || binding.channel,
    accountId: binding.accountId,
    workspaceId: binding.workspaceId || null,
    match: binding.match || {},
    route: binding.route || {},
    security: binding.security || {},
    priority: Number(binding.priority || 0),
  }));
}

function getManagedDiagnostics(env = process.env) {
  const snapshot = loadManagedSnapshot(env);
  return {
    mode: "managed",
    cachePath: getManagedSnapshotPath(env),
    hasSnapshot: !!snapshot,
    revision: snapshot?.revision || null,
    etag: snapshot?.etag || null,
    accountCount: Array.isArray(snapshot?.config?.accounts)
      ? snapshot.config.accounts.length
      : 0,
    bindingCount: Array.isArray(snapshot?.config?.bindings)
      ? snapshot.config.bindings.length
      : 0,
  };
}

module.exports = {
  getDataDir,
  getManagedSnapshotPath,
  getGatewayConfigMode,
  loadManagedSnapshot,
  saveManagedSnapshot,
  loadManagedAccounts,
  loadManagedBindings,
  getManagedDiagnostics,
};
