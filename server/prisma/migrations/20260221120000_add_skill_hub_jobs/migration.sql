-- CreateTable
CREATE TABLE "skill_hub_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skillId" TEXT,
    "workspaceId" INTEGER,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "skill_hub_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "skill_hub_jobs_workspaceId_createdAt_idx" ON "skill_hub_jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "skill_hub_jobs_type_status_createdAt_idx" ON "skill_hub_jobs"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "skill_hub_jobs_skillId_idx" ON "skill_hub_jobs"("skillId");
