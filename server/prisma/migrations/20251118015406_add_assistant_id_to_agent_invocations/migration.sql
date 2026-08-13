-- AlterTable
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "assistant_id" TEXT;

-- CreateIndex
CREATE INDEX "workspace_agent_invocations_assistant_id_idx" ON "workspace_agent_invocations"("assistant_id");
