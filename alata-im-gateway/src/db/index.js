const Database = require("better-sqlite3");
const { getDbPath, initDatabase } = require("./init");

let _db = null;
let _dbPath = null;

function getDb(env = process.env) {
  const dbPath = getDbPath(env);
  if (_db && _dbPath !== dbPath) {
    _db.close();
    _db = null;
  }

  if (!_db) {
    initDatabase({ env }); // idempotent
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    _dbPath = dbPath;
  }
  return _db;
}

function resetDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
  _dbPath = null;
}

module.exports = { getDb, getDbPath, resetDb };
