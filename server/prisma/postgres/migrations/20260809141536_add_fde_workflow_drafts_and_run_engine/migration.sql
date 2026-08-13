CREATE TABLE "fde_workflow_drafts" (
    "id" TEXT NOT NULL,
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
    "reviewedAt" TIMESTAMP(3),
    "publishedByUserId" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fde_workflow_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fde_workflow_drafts_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fde_workflow_drafts_workspaceId_status_idx"
  ON "fde_workflow_drafts"("workspaceId", "status");
CREATE INDEX "fde_workflow_drafts_workspaceId_lineageKey_idx"
  ON "fde_workflow_drafts"("workspaceId", "lineageKey");
CREATE UNIQUE INDEX "fde_workflow_drafts_workspaceId_lineageKey_revision_key"
  ON "fde_workflow_drafts"("workspaceId", "lineageKey", "revision");

ALTER TABLE "runs" ADD COLUMN "engine" TEXT;
ALTER TABLE "runs" ADD COLUMN "fdeWorkflowDraftId" TEXT;

-- PostgreSQL deployments have historically received both native JSON objects
-- and JSON.stringify'd objects stored as JSON scalar strings. Parse the latter
-- without aborting the migration on arbitrary legacy text.
CREATE OR REPLACE FUNCTION pg_temp.try_parse_jsonb(input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN input::JSONB;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

UPDATE "runs"
SET "engine" = CASE
  -- Native PostgreSQL writers may store a JSON object.
  WHEN jsonb_typeof("metadata") = 'object'
    AND jsonb_typeof("metadata" -> 'engine') = 'string'
    THEN "metadata" ->> 'engine'
  -- The shared Run model JSON.stringify'd metadata before writing to Json.
  WHEN jsonb_typeof("metadata") = 'string'
    AND jsonb_typeof(
      pg_temp.try_parse_jsonb("metadata" #>> '{}')
    ) = 'object'
    AND jsonb_typeof(
      pg_temp.try_parse_jsonb("metadata" #>> '{}') -> 'engine'
    ) = 'string'
    THEN pg_temp.try_parse_jsonb("metadata" #>> '{}') ->> 'engine'
  ELSE NULL
END;

ALTER TABLE "runs" ADD CONSTRAINT "runs_fdeWorkflowDraftId_fkey"
  FOREIGN KEY ("fdeWorkflowDraftId") REFERENCES "fde_workflow_drafts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
