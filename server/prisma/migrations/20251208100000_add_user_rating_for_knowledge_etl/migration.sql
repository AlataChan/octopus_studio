-- AlterTable: Add user_rating field for knowledge ETL
-- Phase 2: 用户评分用于高质量交互筛选和知识同步
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "user_rating" INTEGER;

-- CreateIndex: ETL 查询优化（成功且高评分的记录）
CREATE INDEX "workspace_agent_invocations_success_user_rating_idx" ON "workspace_agent_invocations"("success", "user_rating");

-- CreateIndex: 时间范围查询优化
CREATE INDEX "workspace_agent_invocations_createdAt_idx" ON "workspace_agent_invocations"("createdAt");

