-- CreateTable
CREATE TABLE "fde_authoring_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "fdeSessionId" TEXT NOT NULL,
    "fdeFromTurnId" TEXT,
    "fdeToTurnId" TEXT,
    "createdByUserId" INTEGER,
    CONSTRAINT "fde_authoring_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fde_run_checkpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "nodeCursor" TEXT NOT NULL,
    "nodeOutputs" TEXT NOT NULL DEFAULT '{}',
    "pendingAction" TEXT,
    "inputDigest" TEXT NOT NULL,
    "attemptToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fde_run_checkpoints_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "surfaceId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "engine" TEXT,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "eventSeq" INTEGER NOT NULL DEFAULT 0,
    "fdeWorkflowDraftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "runs_fdeWorkflowDraftId_fkey" FOREIGN KEY ("fdeWorkflowDraftId") REFERENCES "fde_workflow_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_runs" ("completedAt", "createdAt", "engine", "errorCode", "errorDetail", "fdeWorkflowDraftId", "id", "metadata", "startedAt", "stateVersion", "status", "surfaceId", "threadId", "triggerId", "triggerType", "updatedAt", "workspaceId") SELECT "completedAt", "createdAt", "engine", "errorCode", "errorDetail", "fdeWorkflowDraftId", "id", "metadata", "startedAt", "stateVersion", "status", "surfaceId", "threadId", "triggerId", "triggerType", "updatedAt", "workspaceId" FROM "runs";
DROP TABLE "runs";
ALTER TABLE "new_runs" RENAME TO "runs";
UPDATE "runs" SET "eventSeq" = COALESCE(
  (SELECT MAX("seq") FROM "run_events" WHERE "run_events"."runId" = "runs"."id"),
  0
);
CREATE INDEX "runs_threadId_idx" ON "runs"("threadId");
CREATE INDEX "runs_workspaceId_status_idx" ON "runs"("workspaceId", "status");
CREATE INDEX "runs_triggerType_triggerId_idx" ON "runs"("triggerType", "triggerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "fde_authoring_sessions_fdeSessionId_key" ON "fde_authoring_sessions"("fdeSessionId");

-- CreateIndex
CREATE INDEX "fde_authoring_sessions_workspaceId_idx" ON "fde_authoring_sessions"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "fde_run_checkpoints_runId_key" ON "fde_run_checkpoints"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "fde_run_checkpoints_attemptToken_key" ON "fde_run_checkpoints"("attemptToken");
