CREATE TABLE "coding_agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "sourceRepoPath" TEXT NOT NULL,
    "sandboxPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'fake',
    "model" TEXT,
    "maxTurns" INTEGER NOT NULL DEFAULT 20,
    "totalTurns" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" REAL NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "appliedAt" DATETIME,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

CREATE TABLE "coding_agent_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coding_agent_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "coding_agent_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "coding_agent_artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "label" TEXT,
    "storageRef" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coding_agent_artifacts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "coding_agent_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "coding_agent_runs_status_createdAt_idx" ON "coding_agent_runs"("status", "createdAt");
CREATE INDEX "coding_agent_runs_sourceRepoPath_idx" ON "coding_agent_runs"("sourceRepoPath");
CREATE INDEX "coding_agent_runs_sandboxPath_idx" ON "coding_agent_runs"("sandboxPath");
CREATE UNIQUE INDEX "coding_agent_events_runId_seq_key" ON "coding_agent_events"("runId", "seq");
CREATE INDEX "coding_agent_events_runId_createdAt_idx" ON "coding_agent_events"("runId", "createdAt");
CREATE INDEX "coding_agent_artifacts_runId_idx" ON "coding_agent_artifacts"("runId");
