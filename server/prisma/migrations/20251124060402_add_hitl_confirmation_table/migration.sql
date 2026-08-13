-- CreateTable
CREATE TABLE "workflow_pending_confirmations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "respondedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workflow_pending_confirmations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_workspaceId_status_idx" ON "workflow_pending_confirmations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_userId_status_idx" ON "workflow_pending_confirmations"("userId", "status");

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_threadId_idx" ON "workflow_pending_confirmations"("threadId");
