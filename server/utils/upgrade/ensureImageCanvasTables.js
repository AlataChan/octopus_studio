const prisma = require("../prisma");

// Only relevant for the desktop (Electron) SQLite database.
function isDesktopRuntime() {
  return process.env.ANYTHING_LLM_RUNTIME === "desktop";
}

async function ensureImageCanvasTables() {
  if (!isDesktopRuntime()) return;

  try {
    // Create tables in dependency order (projects -> versions/assets/jobs).
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "image_projects" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" INTEGER NOT NULL,
        "userId" INTEGER,
        "threadId" INTEGER,
        "title" TEXT,
        "currentVersionId" TEXT,
        "sourceType" TEXT NOT NULL,
        "sourceProvider" TEXT,
        "sourcePrompt" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "image_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "image_project_versions" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "parentVersionId" TEXT,
        "outputAssetId" TEXT NOT NULL,
        "sceneGraph" TEXT NOT NULL,
        "derivedAssets" TEXT,
        "metrics" TEXT,
        "versionType" TEXT NOT NULL,
        "description" TEXT,
        "jobId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "image_project_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "image_assets" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" INTEGER NOT NULL,
        "projectId" TEXT,
        "filename" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "sizeBytes" INTEGER NOT NULL,
        "width" INTEGER NOT NULL,
        "height" INTEGER NOT NULL,
        "storageBackend" TEXT NOT NULL DEFAULT 'local',
        "storagePath" TEXT NOT NULL,
        "checksum" TEXT,
        "metadata" TEXT,
        "expiresAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "image_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "image_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "image_jobs" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" INTEGER NOT NULL,
        "projectId" TEXT,
        "userId" INTEGER,
        "type" TEXT NOT NULL,
        "params" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "progress" INTEGER,
        "outputAssetId" TEXT,
        "error" TEXT,
        "retryCount" INTEGER NOT NULL DEFAULT 0,
        "maxRetries" INTEGER NOT NULL DEFAULT 3,
        "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
        "providerUsed" TEXT,
        "estimatedCost" REAL,
        "actualCost" REAL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "startedAt" DATETIME,
        "completedAt" DATETIME,
        CONSTRAINT "image_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "image_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    // Create indexes (idempotent).
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_assets_workspaceId_idx" ON "image_assets"("workspaceId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_assets_projectId_idx" ON "image_assets"("projectId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_assets_checksum_idx" ON "image_assets"("checksum");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_assets_expiresAt_idx" ON "image_assets"("expiresAt");`
    );

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_projects_workspaceId_idx" ON "image_projects"("workspaceId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_projects_userId_idx" ON "image_projects"("userId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_projects_threadId_idx" ON "image_projects"("threadId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_projects_status_idx" ON "image_projects"("status");`
    );

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_project_versions_projectId_idx" ON "image_project_versions"("projectId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_project_versions_jobId_idx" ON "image_project_versions"("jobId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_project_versions_createdAt_idx" ON "image_project_versions"("createdAt");`
    );

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_jobs_workspaceId_idx" ON "image_jobs"("workspaceId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_jobs_projectId_idx" ON "image_jobs"("projectId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_jobs_status_idx" ON "image_jobs"("status");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_jobs_createdAt_idx" ON "image_jobs"("createdAt");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "image_jobs_status_createdAt_idx" ON "image_jobs"("status", "createdAt");`
    );
  } catch (error) {
    console.warn(
      "[DesktopSchema] Failed to ensure image canvas tables:",
      error?.message || error
    );
  }
}

module.exports = { ensureImageCanvasTables };
