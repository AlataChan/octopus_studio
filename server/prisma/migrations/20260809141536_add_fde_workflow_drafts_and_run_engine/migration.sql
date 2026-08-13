-- Create the Studio-owned draft and approval record.
CREATE TABLE "fde_workflow_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "fdeSessionId" TEXT,
    "fdeFromTurnId" TEXT,
    "fdeToTurnId" TEXT,
    "diffJson" TEXT,
    "studioReviewPolicyVersion" TEXT NOT NULL DEFAULT '1',
    "lineageKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "parentDraftId" TEXT,
    "name" TEXT NOT NULL,
    "contract" TEXT NOT NULL DEFAULT 'studio-v1',
    "targetVersion" TEXT NOT NULL DEFAULT '1',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "compilerVersion" TEXT NOT NULL,
    "sourceIrVersion" TEXT NOT NULL,
    "sourceIrHash" TEXT NOT NULL,
    "specJson" TEXT NOT NULL,
    "specDigest" TEXT NOT NULL,
    "reviewSubjectDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "engine" TEXT NOT NULL DEFAULT 'mastra',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "resolvedBindingsJson" TEXT NOT NULL DEFAULT '{}',
    "missingBindingsJson" TEXT NOT NULL DEFAULT '[]',
    "reviewStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "reviewedSubjectDigest" TEXT,
    "assignedReviewerId" INTEGER,
    "reviewedByUserId" INTEGER,
    "reviewedAt" DATETIME,
    "publishedByUserId" INTEGER,
    "publishedAt" DATETIME,
    "createdByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fde_workflow_drafts_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fde_workflow_drafts_workspaceId_status_idx"
  ON "fde_workflow_drafts"("workspaceId", "status");
CREATE INDEX "fde_workflow_drafts_workspaceId_lineageKey_idx"
  ON "fde_workflow_drafts"("workspaceId", "lineageKey");
CREATE UNIQUE INDEX "fde_workflow_drafts_workspaceId_lineageKey_revision_key"
  ON "fde_workflow_drafts"("workspaceId", "lineageKey", "revision");

-- SQLite must rebuild runs to add the nullable draft foreign key. Legacy
-- engine ownership is copied only from a textual metadata.engine value; rows
-- without attributable metadata deliberately remain NULL.
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
    "fdeWorkflowDraftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "runs_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "runs_fdeWorkflowDraftId_fkey"
      FOREIGN KEY ("fdeWorkflowDraftId") REFERENCES "fde_workflow_drafts" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_runs" (
  "completedAt", "createdAt", "engine", "errorCode", "errorDetail", "id",
  "metadata", "startedAt", "stateVersion", "status", "surfaceId", "threadId",
  "triggerId", "triggerType", "updatedAt", "workspaceId"
)
SELECT
  "completedAt", "createdAt",
  CASE WHEN json_valid("metadata") THEN
    CASE WHEN json_type("metadata", '$.engine') = 'text'
      THEN json_extract("metadata", '$.engine') ELSE NULL END
    ELSE NULL END,
  "errorCode", "errorDetail", "id", "metadata", "startedAt", "stateVersion",
  "status", "surfaceId", "threadId", "triggerId", "triggerType", "updatedAt",
  "workspaceId"
FROM "runs";
DROP TABLE "runs";
ALTER TABLE "new_runs" RENAME TO "runs";
CREATE INDEX "runs_threadId_idx" ON "runs"("threadId");
CREATE INDEX "runs_workspaceId_status_idx" ON "runs"("workspaceId", "status");
CREATE INDEX "runs_triggerType_triggerId_idx" ON "runs"("triggerType", "triggerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
