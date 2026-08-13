ALTER TABLE "workspaces" ADD COLUMN "trajectoryMemoryDisabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "agent_trajectories" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER,
    "scopeKey" TEXT NOT NULL,
    "runId" TEXT,
    "agentKind" TEXT NOT NULL DEFAULT 'orchestration',
    "goal" TEXT NOT NULL,
    "planShapeJson" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "successScore" DOUBLE PRECISION NOT NULL,
    "tokenCost" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "model" TEXT,
    "tier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_trajectories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_trajectories" ADD CONSTRAINT "agent_trajectories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_trajectories" ADD CONSTRAINT "agent_trajectories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agent_trajectories_scopeKey_successScore_idx" ON "agent_trajectories"("scopeKey", "successScore");
