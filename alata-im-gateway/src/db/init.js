const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { getDataDir, getGatewayConfigMode } = require("../runtime/configStore");

function getDbPath(env = process.env) {
  return path.resolve(getDataDir(env), "gateway.db");
}

function chmodIfExists(target, mode) {
  if (!fs.existsSync(target)) return;
  try {
    fs.chmodSync(target, mode);
  } catch {
    // Best-effort hardening: Docker bind mounts and some filesystems can reject chmod.
  }
}

function secureDatabaseFiles(dbPath) {
  chmodIfExists(path.dirname(dbPath), 0o700);
  chmodIfExists(dbPath, 0o600);
  chmodIfExists(`${dbPath}-wal`, 0o600);
  chmodIfExists(`${dbPath}-shm`, 0o600);
}

function initDatabase({ env = process.env } = {}) {
  const dbPath = getDbPath(env);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  secureDatabaseFiles(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const mode = getGatewayConfigMode(env);

  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider        TEXT    NOT NULL,
      account_id      TEXT    NOT NULL,
      peer_id         TEXT    NOT NULL,
      peer_type       TEXT    NOT NULL,
      sender_id       TEXT    NOT NULL DEFAULT '',
      binding_id      TEXT    NOT NULL,
      workspace_slug  TEXT    NOT NULL,
      thread_slug     TEXT    NOT NULL,
      last_active_at  INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      UNIQUE(provider, account_id, peer_id, sender_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_lookup
      ON channel_sessions(provider, account_id, peer_id);

    CREATE TABLE IF NOT EXISTS event_dedup (
      event_id    TEXT    PRIMARY KEY,
      provider    TEXT    NOT NULL,
      received_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dedup_expire ON event_dedup(received_at);

    CREATE TABLE IF NOT EXISTS message_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider    TEXT    NOT NULL,
      event_id    TEXT,
      direction   TEXT    NOT NULL,
      binding_id  TEXT,
      peer_id     TEXT,
      sender_id   TEXT,
      workspace_slug TEXT,
      thread_slug TEXT,
      status      TEXT    NOT NULL,
      error_type  TEXT,
      latency_ms  INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_binding ON message_events(binding_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_peer ON message_events(provider, peer_id, created_at);
  `);

  if (mode !== "managed") {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bindings (
        id          TEXT    PRIMARY KEY,
        enabled     INTEGER NOT NULL DEFAULT 1,
        channel     TEXT    NOT NULL,
        account_id  TEXT    NOT NULL,
        match_json  TEXT    NOT NULL,
        route_json  TEXT    NOT NULL,
        security_json TEXT  NOT NULL,
        priority    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bindings_match
        ON bindings(channel, account_id, priority DESC);
    `);
  }

  db.close();
  secureDatabaseFiles(dbPath);
  console.log("[DB] Database initialized at", dbPath);
}

module.exports = { initDatabase, getDbPath };

if (require.main === module) {
  initDatabase();
}
