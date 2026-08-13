-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_workspace_assistants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "instanceName" TEXT,
    "customConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "knowledgeModeOverride" TEXT,
    "lastUsedAt" DATETIME,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_assistants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_assistants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assistant_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_workspace_assistants" ("createdAt", "customConfig", "enabled", "id", "instanceName", "knowledgeModeOverride", "templateId", "workspaceId") SELECT "createdAt", "customConfig", "enabled", "id", "instanceName", "knowledgeModeOverride", "templateId", "workspaceId" FROM "workspace_assistants";
DROP TABLE "workspace_assistants";
ALTER TABLE "new_workspace_assistants" RENAME TO "workspace_assistants";
CREATE INDEX "workspace_assistants_workspaceId_idx" ON "workspace_assistants"("workspaceId");
CREATE INDEX "workspace_assistants_templateId_idx" ON "workspace_assistants"("templateId");
CREATE UNIQUE INDEX "workspace_assistants_workspaceId_templateId_key" ON "workspace_assistants"("workspaceId", "templateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
