-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "secret" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "rateLimit" INTEGER DEFAULT 100,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "permissions" TEXT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_documents" (
    "id" SERIAL NOT NULL,
    "docId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "docpath" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "metadata" TEXT,
    "pinned" BOOLEAN DEFAULT false,
    "watched" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "claimedBy" INTEGER,
    "workspaceIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "pfpFilename" TEXT,
    "role" TEXT NOT NULL DEFAULT 'default',
    "suspended" INTEGER NOT NULL DEFAULT 0,
    "seen_recovery_codes" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyMessageLimit" INTEGER,
    "bio" TEXT DEFAULT '',
    "metadata" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_vectors" (
    "id" SERIAL NOT NULL,
    "docId" TEXT NOT NULL,
    "vectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_vectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_messages" (
    "id" SERIAL NOT NULL,
    "user" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "orderIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vectorTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openAiTemp" DOUBLE PRECISION,
    "openAiHistory" INTEGER NOT NULL DEFAULT 40,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openAiPrompt" TEXT,
    "similarityThreshold" DOUBLE PRECISION DEFAULT 0.25,
    "chatProvider" TEXT,
    "chatModel" TEXT,
    "topN" INTEGER DEFAULT 4,
    "chatMode" TEXT DEFAULT 'chat',
    "pfpFilename" TEXT,
    "agentProvider" TEXT,
    "agentModel" TEXT,
    "queryRefusalResponse" TEXT,
    "vectorSearchMode" TEXT DEFAULT 'default',
    "enhancedIntelligence" BOOLEAN DEFAULT false,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_threads" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_suggested_messages" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_suggested_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_chats" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "thread_id" INTEGER,
    "api_session_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedbackScore" BOOLEAN,

    CONSTRAINT "workspace_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_agent_invocations" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN,
    "user_id" INTEGER,
    "thread_id" INTEGER,
    "workspace_id" INTEGER NOT NULL,
    "assistant_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_rating" INTEGER,
    "knowledge_coverage" TEXT,
    "graph_nodes_used" INTEGER,
    "vector_sources_used" INTEGER,
    "planning_duration_ms" INTEGER,

    CONSTRAINT "workspace_agent_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_agent_invocation_steps" (
    "id" SERIAL NOT NULL,
    "invocation_id" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL,
    "step_type" TEXT NOT NULL,
    "tool_name" TEXT,
    "input_summary" TEXT,
    "output_summary" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_agent_invocation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_users" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_data" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "belongsTo" TEXT,
    "byId" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embed_configs" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "chat_mode" TEXT NOT NULL DEFAULT 'query',
    "allowlist_domains" TEXT,
    "allow_model_override" BOOLEAN NOT NULL DEFAULT false,
    "allow_temperature_override" BOOLEAN NOT NULL DEFAULT false,
    "allow_prompt_override" BOOLEAN NOT NULL DEFAULT false,
    "max_chats_per_day" INTEGER,
    "max_chats_per_session" INTEGER,
    "message_limit" INTEGER DEFAULT 20,
    "workspace_id" INTEGER NOT NULL,
    "createdBy" INTEGER,
    "usersId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embed_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embed_chats" (
    "id" SERIAL NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "connection_information" TEXT,
    "embed_id" INTEGER NOT NULL,
    "usersId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embed_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" SERIAL NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" TEXT,
    "userId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slash_command_presets" (
    "id" SERIAL NOT NULL,
    "command" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uid" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slash_command_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sync_queues" (
    "id" SERIAL NOT NULL,
    "staleAfterMs" INTEGER NOT NULL DEFAULT 604800000,
    "nextSyncAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceDocId" INTEGER NOT NULL,

    CONSTRAINT "document_sync_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sync_executions" (
    "id" SERIAL NOT NULL,
    "queueId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sync_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_extension_api_keys" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_extension_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_auth_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporary_auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_prompt_variables" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'system',
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_prompt_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_history" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "modifiedBy" INTEGER,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desktop_mobile_devices" (
    "id" SERIAL NOT NULL,
    "deviceOs" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "desktop_mobile_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_parsed_files" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "threadId" INTEGER,
    "metadata" TEXT,
    "tokenCountEstimate" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_parsed_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT NOT NULL,
    "seedCategory" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_assistants" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "instanceName" TEXT,
    "customConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'hired',
    "knowledgeModeOverride" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_assistants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_graph_nodes" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalId" TEXT,
    "metadata" TEXT,
    "group" TEXT,
    "rank" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_graph_edges" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_graph_builds" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "workspace_graph_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_pending_confirmations" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "threadId" INTEGER,
    "chatId" INTEGER,
    "planType" TEXT NOT NULL,
    "planTitle" TEXT NOT NULL,
    "planDetails" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_pending_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_metrics" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "assistantId" TEXT,
    "knowledgeMode" TEXT NOT NULL DEFAULT 'none',
    "responseTime" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "hasError" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_wallets" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "alertThreshold" INTEGER DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "operatorId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "assistantId" TEXT,
    "modelGroup" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL,
    "apiEndpoint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_budgets" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "monthlyLimit" INTEGER,
    "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "resetDay" INTEGER NOT NULL DEFAULT 1,
    "alertAt" INTEGER DEFAULT 80,
    "actionOnLimit" TEXT NOT NULL DEFAULT 'alert',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_assignments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "sessionId" TEXT,
    "experiment" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "profileSummary" TEXT,
    "preferredStyle" TEXT,
    "topicsOfInterest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_experience_memory" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "context" TEXT,
    "invocationId" TEXT,
    "workspaceId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_experience_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "assistantId" TEXT,
    "threadSlug" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" TEXT NOT NULL,
    "cronExpression" TEXT,
    "executeAt" TIMESTAMP(3),
    "intervalMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "actionType" TEXT NOT NULL,
    "actionConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "maxRuns" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_task_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "output" TEXT,
    "error" TEXT,

    CONSTRAINT "scheduled_task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_review_tasks" (
    "id" TEXT NOT NULL,
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
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "document_review_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_assets" (
    "id" TEXT NOT NULL,
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
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "threadId" INTEGER,
    "title" TEXT,
    "currentVersionId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceProvider" TEXT,
    "sourcePrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_project_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "outputAssetId" TEXT NOT NULL,
    "sceneGraph" TEXT NOT NULL,
    "derivedAssets" TEXT,
    "metrics" TEXT,
    "versionType" TEXT NOT NULL,
    "description" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_jobs" (
    "id" TEXT NOT NULL,
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
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "image_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_secret_key" ON "api_keys"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_documents_docId_key" ON "workspace_documents"("docId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_label_key" ON "system_settings"("label");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_threads_slug_key" ON "workspace_threads"("slug");

-- CreateIndex
CREATE INDEX "workspace_threads_workspace_id_idx" ON "workspace_threads"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_threads_user_id_idx" ON "workspace_threads"("user_id");

-- CreateIndex
CREATE INDEX "workspace_suggested_messages_workspaceId_idx" ON "workspace_suggested_messages"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_agent_invocations_uuid_key" ON "workspace_agent_invocations"("uuid");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_uuid_idx" ON "workspace_agent_invocations"("uuid");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_assistant_id_idx" ON "workspace_agent_invocations"("assistant_id");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_success_idx" ON "workspace_agent_invocations"("success");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_knowledge_coverage_idx" ON "workspace_agent_invocations"("knowledge_coverage");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_success_user_rating_idx" ON "workspace_agent_invocations"("success", "user_rating");

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_createdAt_idx" ON "workspace_agent_invocations"("createdAt");

-- CreateIndex
CREATE INDEX "workspace_agent_invocation_steps_invocation_id_step_index_idx" ON "workspace_agent_invocation_steps"("invocation_id", "step_index");

-- CreateIndex
CREATE INDEX "workspace_agent_invocation_steps_tool_name_idx" ON "workspace_agent_invocation_steps"("tool_name");

-- CreateIndex
CREATE INDEX "workspace_agent_invocation_steps_created_at_idx" ON "workspace_agent_invocation_steps"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "embed_configs_uuid_key" ON "embed_configs"("uuid");

-- CreateIndex
CREATE INDEX "event_logs_event_idx" ON "event_logs"("event");

-- CreateIndex
CREATE UNIQUE INDEX "slash_command_presets_uid_command_key" ON "slash_command_presets"("uid", "command");

-- CreateIndex
CREATE UNIQUE INDEX "document_sync_queues_workspaceDocId_key" ON "document_sync_queues"("workspaceDocId");

-- CreateIndex
CREATE UNIQUE INDEX "browser_extension_api_keys_key_key" ON "browser_extension_api_keys"("key");

-- CreateIndex
CREATE INDEX "browser_extension_api_keys_user_id_idx" ON "browser_extension_api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "temporary_auth_tokens_token_key" ON "temporary_auth_tokens"("token");

-- CreateIndex
CREATE INDEX "temporary_auth_tokens_token_idx" ON "temporary_auth_tokens"("token");

-- CreateIndex
CREATE INDEX "temporary_auth_tokens_userId_idx" ON "temporary_auth_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "system_prompt_variables_key_key" ON "system_prompt_variables"("key");

-- CreateIndex
CREATE INDEX "system_prompt_variables_userId_idx" ON "system_prompt_variables"("userId");

-- CreateIndex
CREATE INDEX "prompt_history_workspaceId_idx" ON "prompt_history"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_mobile_devices_token_key" ON "desktop_mobile_devices"("token");

-- CreateIndex
CREATE INDEX "desktop_mobile_devices_userId_idx" ON "desktop_mobile_devices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_parsed_files_filename_key" ON "workspace_parsed_files"("filename");

-- CreateIndex
CREATE INDEX "workspace_parsed_files_workspaceId_idx" ON "workspace_parsed_files"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_parsed_files_userId_idx" ON "workspace_parsed_files"("userId");

-- CreateIndex
CREATE INDEX "assistant_templates_category_isGlobal_idx" ON "assistant_templates"("category", "isGlobal");

-- CreateIndex
CREATE INDEX "assistant_templates_seedCategory_idx" ON "assistant_templates"("seedCategory");

-- CreateIndex
CREATE INDEX "assistant_templates_tenantId_idx" ON "assistant_templates"("tenantId");

-- CreateIndex
CREATE INDEX "assistant_templates_sourceType_pluginType_idx" ON "assistant_templates"("sourceType", "pluginType");

-- CreateIndex
CREATE INDEX "assistant_templates_contentHash_idx" ON "assistant_templates"("contentHash");

-- CreateIndex
CREATE INDEX "assistant_templates_isDefault_idx" ON "assistant_templates"("isDefault");

-- CreateIndex
CREATE INDEX "workspace_assistants_workspaceId_idx" ON "workspace_assistants"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_assistants_templateId_idx" ON "workspace_assistants"("templateId");

-- CreateIndex
CREATE INDEX "workspace_assistants_category_idx" ON "workspace_assistants"("category");

-- CreateIndex
CREATE INDEX "workspace_assistants_source_idx" ON "workspace_assistants"("source");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_assistants_workspaceId_templateId_key" ON "workspace_assistants"("workspaceId", "templateId");

-- CreateIndex
CREATE INDEX "workspace_graph_nodes_workspaceId_type_idx" ON "workspace_graph_nodes"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "workspace_graph_nodes_workspaceId_externalId_idx" ON "workspace_graph_nodes"("workspaceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_graph_nodes_workspaceId_nodeId_key" ON "workspace_graph_nodes"("workspaceId", "nodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_fromNodeId_idx" ON "workspace_graph_edges"("workspaceId", "fromNodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_toNodeId_idx" ON "workspace_graph_edges"("workspaceId", "toNodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_relation_idx" ON "workspace_graph_edges"("workspaceId", "relation");

-- CreateIndex
CREATE INDEX "workspace_graph_builds_workspaceId_status_idx" ON "workspace_graph_builds"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workspace_graph_builds_createdAt_idx" ON "workspace_graph_builds"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_workspaceId_status_idx" ON "workflow_pending_confirmations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_userId_status_idx" ON "workflow_pending_confirmations"("userId", "status");

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_threadId_idx" ON "workflow_pending_confirmations"("threadId");

-- CreateIndex
CREATE INDEX "chat_metrics_workspaceId_createdAt_idx" ON "chat_metrics"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_userId_createdAt_idx" ON "chat_metrics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_assistantId_createdAt_idx" ON "chat_metrics"("assistantId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_knowledgeMode_createdAt_idx" ON "chat_metrics"("knowledgeMode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_wallets_userId_key" ON "user_wallets"("userId");

-- CreateIndex
CREATE INDEX "user_wallets_userId_idx" ON "user_wallets"("userId");

-- CreateIndex
CREATE INDEX "wallet_topups_userId_idx" ON "wallet_topups"("userId");

-- CreateIndex
CREATE INDEX "wallet_topups_operatorId_idx" ON "wallet_topups"("operatorId");

-- CreateIndex
CREATE INDEX "wallet_topups_createdAt_idx" ON "wallet_topups"("createdAt");

-- CreateIndex
CREATE INDEX "usage_logs_userId_createdAt_idx" ON "usage_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_logs_workspaceId_createdAt_idx" ON "usage_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_logs_assistantId_createdAt_idx" ON "usage_logs"("assistantId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_logs_modelGroup_createdAt_idx" ON "usage_logs"("modelGroup", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_budgets_workspaceId_key" ON "workspace_budgets"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_budgets_workspaceId_idx" ON "workspace_budgets"("workspaceId");

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
CREATE INDEX "scheduled_tasks_workspaceId_enabled_idx" ON "scheduled_tasks"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "scheduled_tasks_enabled_nextRunAt_idx" ON "scheduled_tasks"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_tasks_scheduleType_idx" ON "scheduled_tasks"("scheduleType");

-- CreateIndex
CREATE INDEX "scheduled_task_logs_taskId_startedAt_idx" ON "scheduled_task_logs"("taskId", "startedAt");

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

-- AddForeignKey
ALTER TABLE "workspace_documents" ADD CONSTRAINT "workspace_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_threads" ADD CONSTRAINT "workspace_threads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_threads" ADD CONSTRAINT "workspace_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_suggested_messages" ADD CONSTRAINT "workspace_suggested_messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_chats" ADD CONSTRAINT "workspace_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_agent_invocations" ADD CONSTRAINT "workspace_agent_invocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_agent_invocations" ADD CONSTRAINT "workspace_agent_invocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_agent_invocation_steps" ADD CONSTRAINT "workspace_agent_invocation_steps_invocation_id_fkey" FOREIGN KEY ("invocation_id") REFERENCES "workspace_agent_invocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_users" ADD CONSTRAINT "workspace_users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_users" ADD CONSTRAINT "workspace_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embed_configs" ADD CONSTRAINT "embed_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embed_configs" ADD CONSTRAINT "embed_configs_usersId_fkey" FOREIGN KEY ("usersId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embed_chats" ADD CONSTRAINT "embed_chats_embed_id_fkey" FOREIGN KEY ("embed_id") REFERENCES "embed_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embed_chats" ADD CONSTRAINT "embed_chats_usersId_fkey" FOREIGN KEY ("usersId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slash_command_presets" ADD CONSTRAINT "slash_command_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sync_queues" ADD CONSTRAINT "document_sync_queues_workspaceDocId_fkey" FOREIGN KEY ("workspaceDocId") REFERENCES "workspace_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sync_executions" ADD CONSTRAINT "document_sync_executions_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "document_sync_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_extension_api_keys" ADD CONSTRAINT "browser_extension_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_auth_tokens" ADD CONSTRAINT "temporary_auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_prompt_variables" ADD CONSTRAINT "system_prompt_variables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_modifiedBy_fkey" FOREIGN KEY ("modifiedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desktop_mobile_devices" ADD CONSTRAINT "desktop_mobile_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_parsed_files" ADD CONSTRAINT "workspace_parsed_files_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_parsed_files" ADD CONSTRAINT "workspace_parsed_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_parsed_files" ADD CONSTRAINT "workspace_parsed_files_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "workspace_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_assistants" ADD CONSTRAINT "workspace_assistants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_assistants" ADD CONSTRAINT "workspace_assistants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assistant_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_graph_nodes" ADD CONSTRAINT "workspace_graph_nodes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_graph_edges" ADD CONSTRAINT "workspace_graph_edges_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_graph_builds" ADD CONSTRAINT "workspace_graph_builds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_pending_confirmations" ADD CONSTRAINT "workflow_pending_confirmations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_metrics" ADD CONSTRAINT "chat_metrics_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_budgets" ADD CONSTRAINT "workspace_budgets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_task_logs" ADD CONSTRAINT "scheduled_task_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "scheduled_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_tasks" ADD CONSTRAINT "document_review_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_projects" ADD CONSTRAINT "image_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_project_versions" ADD CONSTRAINT "image_project_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "image_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
