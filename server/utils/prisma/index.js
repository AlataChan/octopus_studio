const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// npx prisma introspect
// npx prisma generate
// npx prisma migrate dev --name init -> ensures that db is in sync with schema
// npx prisma migrate reset -> resets the db

const logLevels = ["error", "info", "warn"]; // add "query" to debug query logs
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Prefer STORAGE_DIR when provided (Electron sets it to a writable userData directory).
  if (process.env.STORAGE_DIR) {
    const storageDir = path.resolve(process.env.STORAGE_DIR);
    try {
      fs.mkdirSync(storageDir, { recursive: true });
    } catch {}
    return `file:${path.join(storageDir, "anythingllm.db")}`;
  }

  // Fallback to the Prisma schema's datasource url.
  return null;
}

const databaseUrl = resolveDatabaseUrl();
const prisma = new PrismaClient({
  log: logLevels,
  ...(databaseUrl
    ? {
        datasources: {
          db: { url: databaseUrl },
        },
      }
    : {}),
});

module.exports = prisma;
