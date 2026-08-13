-- AI员工进化系统 MVP Phase 1
-- 添加调用步骤追踪表和成功状态字段

-- AlterTable: workspace_agent_invocations 添加 success 字段
ALTER TABLE "workspace_agent_invocations" ADD COLUMN "success" BOOLEAN;

-- CreateIndex: 为 success 字段创建索引以优化聚合查询
CREATE INDEX "workspace_agent_invocations_success_idx" ON "workspace_agent_invocations"("success");

-- CreateTable: workspace_agent_invocation_steps
CREATE TABLE "workspace_agent_invocation_steps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invocation_id" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL,
    "step_type" TEXT NOT NULL,
    "tool_name" TEXT,
    "input_summary" TEXT,
    "output_summary" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_agent_invocation_steps_invocation_id_fkey" FOREIGN KEY ("invocation_id") REFERENCES "workspace_agent_invocations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: 复合索引用于按调用ID和步骤顺序查询
CREATE INDEX "workspace_agent_invocation_steps_invocation_id_step_index_idx" ON "workspace_agent_invocation_steps"("invocation_id", "step_index");

-- CreateIndex: 工具名称索引用于分析热门工具
CREATE INDEX "workspace_agent_invocation_steps_tool_name_idx" ON "workspace_agent_invocation_steps"("tool_name");

-- CreateIndex: 时间索引用于时间范围查询和数据清理
CREATE INDEX "workspace_agent_invocation_steps_created_at_idx" ON "workspace_agent_invocation_steps"("created_at");

