-- CreateTable
CREATE TABLE IF NOT EXISTS "skill_hub_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skillId" TEXT,
    "workspaceId" INTEGER,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_hub_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_hub_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_hub_jobs_workspaceId_createdAt_idx" ON "skill_hub_jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_hub_jobs_type_status_createdAt_idx" ON "skill_hub_jobs"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_hub_jobs_skillId_idx" ON "skill_hub_jobs"("skillId");
