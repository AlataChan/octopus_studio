-- CreateTable
CREATE TABLE "image_projects" (
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

-- CreateTable
CREATE TABLE "image_project_versions" (
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

-- CreateTable
CREATE TABLE "image_assets" (
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

-- CreateTable
CREATE TABLE "image_jobs" (
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

-- CreateIndex
CREATE INDEX "image_assets_workspaceId_idx" ON "image_assets"("workspaceId");

-- CreateIndex
CREATE INDEX "image_assets_projectId_idx" ON "image_assets"("projectId");

-- CreateIndex
CREATE INDEX "image_assets_checksum_idx" ON "image_assets"("checksum");

-- CreateIndex
CREATE INDEX "image_assets_expiresAt_idx" ON "image_assets"("expiresAt");

-- CreateIndex
CREATE INDEX "image_projects_workspaceId_idx" ON "image_projects"("workspaceId");

-- CreateIndex
CREATE INDEX "image_projects_userId_idx" ON "image_projects"("userId");

-- CreateIndex
CREATE INDEX "image_projects_threadId_idx" ON "image_projects"("threadId");

-- CreateIndex
CREATE INDEX "image_projects_status_idx" ON "image_projects"("status");

-- CreateIndex
CREATE INDEX "image_project_versions_projectId_idx" ON "image_project_versions"("projectId");

-- CreateIndex
CREATE INDEX "image_project_versions_jobId_idx" ON "image_project_versions"("jobId");

-- CreateIndex
CREATE INDEX "image_project_versions_createdAt_idx" ON "image_project_versions"("createdAt");

-- CreateIndex
CREATE INDEX "image_jobs_workspaceId_idx" ON "image_jobs"("workspaceId");

-- CreateIndex
CREATE INDEX "image_jobs_projectId_idx" ON "image_jobs"("projectId");

-- CreateIndex
CREATE INDEX "image_jobs_status_idx" ON "image_jobs"("status");

-- CreateIndex
CREATE INDEX "image_jobs_createdAt_idx" ON "image_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "image_jobs_status_createdAt_idx" ON "image_jobs"("status", "createdAt");

