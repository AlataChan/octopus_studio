const { getDb } = require("../db");
const {
  getGatewayConfigMode,
  loadManagedBindings,
  getManagedDiagnostics,
} = require("../runtime/configStore");

function mapBindingRow(row) {
  return {
    id: row.id,
    enabled: !!row.enabled,
    channel: row.channel,
    provider: row.channel,
    accountId: row.account_id,
    match: JSON.parse(row.match_json),
    route: JSON.parse(row.route_json),
    security: JSON.parse(row.security_json),
    priority: row.priority,
  };
}

function loadBindings({ mode = null, env = process.env } = {}) {
  const resolvedMode = mode || getGatewayConfigMode(env);
  if (resolvedMode === "managed") {
    return loadManagedBindings(env);
  }

  const db = getDb(env);
  const hasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bindings'")
    .get();

  if (!hasTable) return [];

  const rows = db
    .prepare("SELECT * FROM bindings WHERE enabled=1 ORDER BY priority DESC")
    .all();
  return rows.map(mapBindingRow);
}

function saveBinding(binding, { mode = null, env = process.env } = {}) {
  const resolvedMode = mode || getGatewayConfigMode(env);
  if (resolvedMode === "managed") {
    throw new Error("Bindings are managed by the Alata control plane");
  }

  const db = getDb(env);
  const now = Date.now();
  db.prepare(
    `
    INSERT OR REPLACE INTO bindings
      (id, enabled, channel, account_id, match_json, route_json, security_json, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    binding.id,
    binding.enabled ? 1 : 0,
    binding.channel,
    binding.accountId,
    JSON.stringify(binding.match),
    JSON.stringify(binding.route),
    JSON.stringify(binding.security),
    binding.priority || 0,
    now,
    now
  );
}

function deleteBinding(id, { mode = null, env = process.env } = {}) {
  const resolvedMode = mode || getGatewayConfigMode(env);
  if (resolvedMode === "managed") {
    throw new Error("Bindings are managed by the Alata control plane");
  }
  getDb(env).prepare("DELETE FROM bindings WHERE id=?").run(id);
}

function exportLocalBindings({ env = process.env } = {}) {
  const db = getDb(env);
  const hasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bindings'")
    .get();

  if (!hasTable) return [];

  const rows = db
    .prepare("SELECT * FROM bindings ORDER BY priority DESC, updated_at DESC")
    .all();
  return rows.map(mapBindingRow);
}

function bindingDiagnostics({ env = process.env } = {}) {
  const mode = getGatewayConfigMode(env);
  if (mode === "managed") return getManagedDiagnostics(env);

  return {
    mode: "standalone",
    bindingCount: exportLocalBindings({ env }).length,
  };
}

module.exports = {
  loadBindings,
  saveBinding,
  deleteBinding,
  exportLocalBindings,
  bindingDiagnostics,
};
