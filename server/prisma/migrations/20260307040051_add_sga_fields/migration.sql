-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_skill_installations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "sgaServerId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "skill_installations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_skill_installations" ("createdAt", "id", "scopeId", "scopeType", "skillId", "updatedAt", "workspaceId") SELECT "createdAt", "id", "scopeId", "scopeType", "skillId", "updatedAt", "workspaceId" FROM "skill_installations";
DROP TABLE "skill_installations";
ALTER TABLE "new_skill_installations" RENAME TO "skill_installations";
CREATE INDEX "skill_installations_workspaceId_idx" ON "skill_installations"("workspaceId");
CREATE INDEX "skill_installations_skillId_idx" ON "skill_installations"("skillId");
CREATE INDEX "skill_installations_sgaServerId_idx" ON "skill_installations"("sgaServerId");
CREATE UNIQUE INDEX "skill_installations_skillId_workspaceId_scopeType_scopeId_key" ON "skill_installations"("skillId", "workspaceId", "scopeType", "scopeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
