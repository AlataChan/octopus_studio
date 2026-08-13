-- CreateTable
CREATE TABLE IF NOT EXISTS "channel_accounts" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "encryptedSecrets" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_accounts_provider_accountId_key" UNIQUE ("provider", "accountId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "channel_bindings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "matchJson" TEXT NOT NULL,
    "routeJson" TEXT NOT NULL,
    "securityJson" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_bindings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_bindings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_bindings_provider_accountId_fkey" FOREIGN KEY ("provider", "accountId") REFERENCES "channel_accounts"("provider", "accountId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "channel_sessions" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "peerType" TEXT NOT NULL,
    "senderId" TEXT,
    "sessionKey" TEXT NOT NULL,
    "sessionScope" TEXT NOT NULL DEFAULT 'per-channel-peer',
    "bindingId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "threadId" INTEGER NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_sessions_provider_accountId_fkey" FOREIGN KEY ("provider", "accountId") REFERENCES "channel_accounts"("provider", "accountId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_sessions_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "channel_bindings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_sessions_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "workspace_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "channel_message_events" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "messageId" TEXT,
    "direction" TEXT NOT NULL,
    "bindingId" TEXT,
    "sessionKey" TEXT,
    "agentId" TEXT,
    "status" TEXT NOT NULL,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_message_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_message_events_provider_accountId_fkey" FOREIGN KEY ("provider", "accountId") REFERENCES "channel_accounts"("provider", "accountId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_message_events_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "channel_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_accounts_provider_status_idx" ON "channel_accounts"("provider", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_bindings_provider_accountId_priority_idx" ON "channel_bindings"("provider", "accountId", "priority");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_bindings_workspaceId_idx" ON "channel_bindings"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "channel_sessions_sessionKey_key" ON "channel_sessions"("sessionKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_sessions_provider_accountId_peerId_idx" ON "channel_sessions"("provider", "accountId", "peerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_sessions_provider_accountId_peerId_senderId_idx" ON "channel_sessions"("provider", "accountId", "peerId", "senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_sessions_bindingId_idx" ON "channel_sessions"("bindingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_sessions_threadId_idx" ON "channel_sessions"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "channel_message_events_provider_accountId_eventId_key" ON "channel_message_events"("provider", "accountId", "eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_message_events_provider_accountId_createdAt_idx" ON "channel_message_events"("provider", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_message_events_bindingId_createdAt_idx" ON "channel_message_events"("bindingId", "createdAt");
