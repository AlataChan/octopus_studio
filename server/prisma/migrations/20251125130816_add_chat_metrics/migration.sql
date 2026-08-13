-- CreateTable
CREATE TABLE "chat_metrics" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "assistantId" TEXT,
    "knowledgeMode" TEXT NOT NULL DEFAULT 'none',
    "responseTime" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "hasError" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_metrics_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "chat_metrics_workspaceId_createdAt_idx" ON "chat_metrics"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_userId_createdAt_idx" ON "chat_metrics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_assistantId_createdAt_idx" ON "chat_metrics"("assistantId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_metrics_knowledgeMode_createdAt_idx" ON "chat_metrics"("knowledgeMode", "createdAt");
