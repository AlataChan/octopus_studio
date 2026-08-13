-- CreateTable
CREATE TABLE IF NOT EXISTS "skill_catalog" (
    "id" SERIAL NOT NULL,
    "skillId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadataJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "description" TEXT,
    "version" TEXT,
    "category" TEXT,
    "tagsJson" TEXT,
    "icon" TEXT,
    "sourceUrl" TEXT,
    "sourceHash" TEXT,
    "license" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "latestVersion" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "skill_catalog_skillId_source_key" ON "skill_catalog"("skillId", "source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_catalog_source_enabled_idx" ON "skill_catalog"("source", "enabled");

-- CreateTable
CREATE TABLE IF NOT EXISTS "skill_installations" (
    "id" SERIAL NOT NULL,
    "skillId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_installations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_installations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "skill_installations_skillId_workspaceId_scopeType_scopeId_key" ON "skill_installations"("skillId", "workspaceId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_installations_workspaceId_idx" ON "skill_installations"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "skill_installations_skillId_idx" ON "skill_installations"("skillId");

