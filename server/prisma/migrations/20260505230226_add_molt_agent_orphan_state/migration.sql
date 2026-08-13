-- AlterTable
ALTER TABLE "workspace_molt_agents" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "workspace_molt_agents" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "workspace_molt_agents_deletedAt_idx" ON "workspace_molt_agents"("deletedAt");
