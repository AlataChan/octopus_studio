-- CreateTable: assistant_templates
CREATE TABLE IF NOT EXISTS "assistant_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT,
    "industry" TEXT,
    "systemPrompt" TEXT,
    "agentFlowId" TEXT,
    "defaultTools" TEXT,
    "defaultMCPServers" TEXT,
    "recommendedModel" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: workspace_assistants
CREATE TABLE IF NOT EXISTS "workspace_assistants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "instanceName" TEXT,
    "customConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_assistants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_assistants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assistant_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "assistant_templates_category_isGlobal_idx" ON "assistant_templates"("category", "isGlobal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "assistant_templates_tenantId_idx" ON "assistant_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_assistants_workspaceId_templateId_key" ON "workspace_assistants"("workspaceId", "templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspace_assistants_workspaceId_idx" ON "workspace_assistants"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspace_assistants_templateId_idx" ON "workspace_assistants"("templateId");

