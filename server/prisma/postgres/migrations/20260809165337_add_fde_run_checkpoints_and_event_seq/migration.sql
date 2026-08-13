-- Phase 2B adds the Studio authoring reference, durable execution checkpoint,
-- and the per-run event allocator in one provider migration.
CREATE TABLE "fde_authoring_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "fdeSessionId" TEXT NOT NULL,
    "fdeFromTurnId" TEXT,
    "fdeToTurnId" TEXT,
    "createdByUserId" INTEGER,
    CONSTRAINT "fde_authoring_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fde_authoring_sessions_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fde_authoring_sessions_fdeSessionId_key"
  ON "fde_authoring_sessions"("fdeSessionId");
CREATE INDEX "fde_authoring_sessions_workspaceId_idx"
  ON "fde_authoring_sessions"("workspaceId");

CREATE TABLE "fde_run_checkpoints" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeCursor" TEXT NOT NULL,
    "nodeOutputs" TEXT NOT NULL DEFAULT '{}',
    "pendingAction" TEXT,
    "inputDigest" TEXT NOT NULL,
    "attemptToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fde_run_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fde_run_checkpoints_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fde_run_checkpoints_runId_key"
  ON "fde_run_checkpoints"("runId");
CREATE UNIQUE INDEX "fde_run_checkpoints_attemptToken_key"
  ON "fde_run_checkpoints"("attemptToken");

ALTER TABLE "runs" ADD COLUMN "eventSeq" INTEGER NOT NULL DEFAULT 0;
UPDATE "runs" SET "eventSeq" = COALESCE(
  (SELECT MAX("seq") FROM "run_events" WHERE "run_events"."runId" = "runs"."id"),
  0
);
