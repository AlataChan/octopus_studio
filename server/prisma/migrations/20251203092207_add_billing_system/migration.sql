-- CreateTable
CREATE TABLE "user_wallets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "alertThreshold" INTEGER DEFAULT 10000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "operatorId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "assistantId" TEXT,
    "modelGroup" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL,
    "apiEndpoint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workspace_budgets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "monthlyLimit" INTEGER,
    "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "resetDay" INTEGER NOT NULL DEFAULT 1,
    "alertAt" INTEGER DEFAULT 80,
    "actionOnLimit" TEXT NOT NULL DEFAULT 'alert',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workspace_budgets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
