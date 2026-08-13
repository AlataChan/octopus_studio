-- AlterTable
ALTER TABLE "users" ADD COLUMN "metadata" TEXT;

-- AlterTable
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "graph_nodes_used" INTEGER;
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "knowledge_coverage" TEXT;
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "planning_duration_ms" INTEGER;
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "vector_sources_used" INTEGER;

-- AlterTable
ALTER TABLE "workspace_threads" ADD COLUMN "metadata" TEXT;

-- CreateTable
CREATE TABLE "workspace_graph_builds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'full',
    "options" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "stats" TEXT,
    "error" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "workspace_graph_builds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "experiment_assignments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "sessionId" TEXT,
    "experiment" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "profileSummary" TEXT,
    "preferredStyle" TEXT,
    "topicsOfInterest" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "agent_experience_memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "context" TEXT,
    "invocationId" TEXT,
    "workspaceId" INTEGER,
    "userId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "document_review_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "assistantId" TEXT,
    "documentId" TEXT,
    "inputPath" TEXT NOT NULL,
    "outputPath" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileHash" TEXT,
    "fileMtime" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reviewType" TEXT NOT NULL DEFAULT 'standard',
    "options" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" DATETIME,
    "lastError" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "document_review_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_api_keys" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "secret" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "rateLimit" INTEGER DEFAULT 100,
    "lastUsedAt" DATETIME,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "permissions" TEXT
);
INSERT INTO "new_api_keys" ("createdAt", "createdBy", "id", "lastUpdatedAt", "secret") SELECT "createdAt", "createdBy", "id", "lastUpdatedAt", "secret" FROM "api_keys";
DROP TABLE "api_keys";
ALTER TABLE "new_api_keys" RENAME TO "api_keys";
CREATE UNIQUE INDEX "api_keys_secret_key" ON "api_keys"("secret");
CREATE TABLE "new_assistant_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT,
    "industry" TEXT,
    "systemPrompt" TEXT,
    "agentFlowId" TEXT,
    "internalRoles" TEXT,
    "defaultTools" TEXT,
    "defaultMCPServers" TEXT,
    "recommendedModel" TEXT,
    "sourceType" TEXT DEFAULT 'builtin',
    "pluginType" TEXT DEFAULT 'agent',
    "version" TEXT,
    "contentHash" TEXT,
    "originPath" TEXT,
    "defaultPermissionMode" TEXT DEFAULT 'default',
    "defaultAllowedTools" TEXT,
    "defaultAutoApprovedTools" TEXT,
    "resourceScopes" TEXT,
    "avatarUrl" TEXT,
    "employeeName" TEXT,
    "employeeTitle" TEXT,
    "employeeBio" TEXT,
    "skills" TEXT,
    "workExperience" TEXT,
    "certifications" TEXT,
    "platformType" TEXT DEFAULT 'internal',
    "platformConfig" TEXT,
    "knowledgeModeTemplate" TEXT DEFAULT 'workspace',
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_assistant_templates" ("agentFlowId", "avatarUrl", "category", "certifications", "contentHash", "createdAt", "defaultAllowedTools", "defaultAutoApprovedTools", "defaultMCPServers", "defaultPermissionMode", "defaultTools", "description", "employeeBio", "employeeName", "employeeTitle", "icon", "id", "industry", "internalRoles", "isGlobal", "knowledgeModeTemplate", "name", "originPath", "platformConfig", "platformType", "pluginType", "recommendedModel", "resourceScopes", "skills", "sourceType", "systemPrompt", "tags", "tenantId", "updatedAt", "version", "workExperience") SELECT "agentFlowId", "avatarUrl", "category", "certifications", "contentHash", "createdAt", "defaultAllowedTools", "defaultAutoApprovedTools", "defaultMCPServers", "defaultPermissionMode", "defaultTools", "description", "employeeBio", "employeeName", "employeeTitle", "icon", "id", "industry", "internalRoles", "isGlobal", "knowledgeModeTemplate", "name", "originPath", "platformConfig", "platformType", "pluginType", "recommendedModel", "resourceScopes", "skills", "sourceType", "systemPrompt", "tags", "tenantId", "updatedAt", "version", "workExperience" FROM "assistant_templates";
DROP TABLE "assistant_templates";
ALTER TABLE "new_assistant_templates" RENAME TO "assistant_templates";
CREATE INDEX "assistant_templates_category_isGlobal_idx" ON "assistant_templates"("category", "isGlobal");
CREATE INDEX "assistant_templates_tenantId_idx" ON "assistant_templates"("tenantId");
CREATE INDEX "assistant_templates_sourceType_pluginType_idx" ON "assistant_templates"("sourceType", "pluginType");
CREATE INDEX "assistant_templates_contentHash_idx" ON "assistant_templates"("contentHash");
CREATE INDEX "assistant_templates_isDefault_idx" ON "assistant_templates"("isDefault");
CREATE TABLE "new_scheduled_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "assistantId" TEXT,
    "threadSlug" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" TEXT NOT NULL,
    "cronExpression" TEXT,
    "executeAt" DATETIME,
    "intervalMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "actionType" TEXT NOT NULL,
    "actionConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "nextRunAt" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "maxRuns" INTEGER,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scheduled_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_scheduled_tasks" ("actionConfig", "actionType", "assistantId", "createdAt", "createdByUserId", "cronExpression", "description", "enabled", "executeAt", "expiresAt", "id", "intervalMinutes", "lastRunAt", "lastRunError", "lastRunStatus", "maxRuns", "name", "nextRunAt", "runCount", "scheduleType", "threadSlug", "timezone", "updatedAt", "workspaceId") SELECT "actionConfig", "actionType", "assistantId", "createdAt", "createdByUserId", "cronExpression", "description", "enabled", "executeAt", "expiresAt", "id", "intervalMinutes", "lastRunAt", "lastRunError", "lastRunStatus", "maxRuns", "name", "nextRunAt", "runCount", "scheduleType", "threadSlug", "timezone", "updatedAt", "workspaceId" FROM "scheduled_tasks";
DROP TABLE "scheduled_tasks";
ALTER TABLE "new_scheduled_tasks" RENAME TO "scheduled_tasks";
CREATE INDEX "scheduled_tasks_workspaceId_enabled_idx" ON "scheduled_tasks"("workspaceId", "enabled");
CREATE INDEX "scheduled_tasks_enabled_nextRunAt_idx" ON "scheduled_tasks"("enabled", "nextRunAt");
CREATE INDEX "scheduled_tasks_scheduleType_idx" ON "scheduled_tasks"("scheduleType");
CREATE TABLE "new_workspace_assistants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "instanceName" TEXT,
    "customConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'hired',
    "knowledgeModeOverride" TEXT,
    "lastUsedAt" DATETIME,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_assistants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_assistants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assistant_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_workspace_assistants" ("createdAt", "customConfig", "enabled", "id", "instanceName", "knowledgeModeOverride", "lastUsedAt", "templateId", "usageCount", "workspaceId") SELECT "createdAt", "customConfig", "enabled", "id", "instanceName", "knowledgeModeOverride", "lastUsedAt", "templateId", "usageCount", "workspaceId" FROM "workspace_assistants";
DROP TABLE "workspace_assistants";
ALTER TABLE "new_workspace_assistants" RENAME TO "workspace_assistants";
CREATE INDEX "workspace_assistants_workspaceId_idx" ON "workspace_assistants"("workspaceId");
CREATE INDEX "workspace_assistants_templateId_idx" ON "workspace_assistants"("templateId");
CREATE INDEX "workspace_assistants_source_idx" ON "workspace_assistants"("source");
CREATE UNIQUE INDEX "workspace_assistants_workspaceId_templateId_key" ON "workspace_assistants"("workspaceId", "templateId");
CREATE TABLE "new_workspaces" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vectorTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openAiTemp" REAL,
    "openAiHistory" INTEGER NOT NULL DEFAULT 40,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openAiPrompt" TEXT,
    "similarityThreshold" REAL DEFAULT 0.25,
    "chatProvider" TEXT,
    "chatModel" TEXT,
    "topN" INTEGER DEFAULT 4,
    "chatMode" TEXT DEFAULT 'chat',
    "pfpFilename" TEXT,
    "agentProvider" TEXT,
    "agentModel" TEXT,
    "queryRefusalResponse" TEXT,
    "vectorSearchMode" TEXT DEFAULT 'default',
    "enhancedIntelligence" BOOLEAN DEFAULT false
);
INSERT INTO "new_workspaces" ("agentModel", "agentProvider", "chatMode", "chatModel", "chatProvider", "createdAt", "enhancedIntelligence", "id", "lastUpdatedAt", "name", "openAiHistory", "openAiPrompt", "openAiTemp", "pfpFilename", "queryRefusalResponse", "similarityThreshold", "slug", "topN", "vectorSearchMode", "vectorTag") SELECT "agentModel", "agentProvider", "chatMode", "chatModel", "chatProvider", "createdAt", "enhancedIntelligence", "id", "lastUpdatedAt", "name", "openAiHistory", "openAiPrompt", "openAiTemp", "pfpFilename", "queryRefusalResponse", "similarityThreshold", "slug", "topN", "vectorSearchMode", "vectorTag" FROM "workspaces";
DROP TABLE "workspaces";
ALTER TABLE "new_workspaces" RENAME TO "workspaces";
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "workspace_graph_builds_workspaceId_status_idx" ON "workspace_graph_builds"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workspace_graph_builds_createdAt_idx" ON "workspace_graph_builds"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "experiment_assignments_experiment_variant_idx" ON "experiment_assignments"("experiment", "variant");

-- CreateIndex
CREATE INDEX "experiment_assignments_assignedAt_idx" ON "experiment_assignments"("assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_assignments_userId_experiment_key" ON "experiment_assignments"("userId", "experiment");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_workspaceId_idx" ON "user_preferences"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_workspaceId_key" ON "user_preferences"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "agent_experience_memory_platform_taskType_idx" ON "agent_experience_memory"("platform", "taskType");

-- CreateIndex
CREATE INDEX "agent_experience_memory_createdAt_idx" ON "agent_experience_memory"("createdAt");

-- CreateIndex
CREATE INDEX "agent_experience_memory_workspaceId_idx" ON "agent_experience_memory"("workspaceId");

-- CreateIndex
CREATE INDEX "document_review_tasks_workspaceId_status_idx" ON "document_review_tasks"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "document_review_tasks_status_createdAt_idx" ON "document_review_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "document_review_tasks_assistantId_status_idx" ON "document_review_tasks"("assistantId", "status");

-- CreateIndex
CREATE INDEX "document_review_tasks_workspaceId_inputPath_status_idx" ON "document_review_tasks"("workspaceId", "inputPath", "status");

-- CreateIndex
CREATE INDEX "document_review_tasks_fileHash_idx" ON "document_review_tasks"("fileHash");

-- CreateIndex
CREATE INDEX "document_review_tasks_documentId_idx" ON "document_review_tasks"("documentId");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_knowledge_coverage_idx" ON "workspace_agent_invocations"("knowledge_coverage");
