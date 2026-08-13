-- AlterTable
ALTER TABLE "skill_catalog" ADD COLUMN "name" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "description" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "version" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "category" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "tagsJson" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "icon" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "sourceHash" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "license" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "skill_catalog" ADD COLUMN "latestVersion" TEXT;
ALTER TABLE "skill_catalog" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "skill_catalog" ADD COLUMN "status" TEXT;

-- CreateTable
CREATE TABLE "skill_installations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "skill_installations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_installations_skillId_workspaceId_scopeType_scopeId_key" ON "skill_installations"("skillId", "workspaceId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "skill_installations_workspaceId_idx" ON "skill_installations"("workspaceId");

-- CreateIndex
CREATE INDEX "skill_installations_skillId_idx" ON "skill_installations"("skillId");

