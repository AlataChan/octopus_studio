-- AlterTable
ALTER TABLE "workflow_pending_confirmations" ADD COLUMN "runId" TEXT;

-- CreateTable
CREATE TABLE "runs" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "run_artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "label" TEXT,
    "storageRef" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_artifacts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "runs_threadId_idx" ON "runs"("threadId");

-- CreateIndex
CREATE INDEX "runs_workspaceId_status_idx" ON "runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "runs_triggerType_triggerId_idx" ON "runs"("triggerType", "triggerId");

-- CreateIndex
CREATE INDEX "run_artifacts_runId_idx" ON "run_artifacts"("runId");

-- CreateIndex
CREATE INDEX "workflow_pending_confirmations_runId_idx" ON "workflow_pending_confirmations"("runId");
