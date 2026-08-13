-- CreateTable: 用户级定时任务
CREATE TABLE IF NOT EXISTS "scheduled_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" TEXT NOT NULL,
    "cronExpression" TEXT,
    "executeAt" DATETIME,
    "intervalMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "actionType" TEXT NOT NULL,
    "actionConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "nextRunAt" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "maxRuns" INTEGER,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: 定时任务执行日志
CREATE TABLE IF NOT EXISTS "scheduled_task_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "output" TEXT,
    "error" TEXT,
    CONSTRAINT "scheduled_task_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "scheduled_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduled_tasks_workspaceId_enabled_idx" ON "scheduled_tasks"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduled_tasks_enabled_nextRunAt_idx" ON "scheduled_tasks"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduled_tasks_scheduleType_idx" ON "scheduled_tasks"("scheduleType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduled_task_logs_taskId_startedAt_idx" ON "scheduled_task_logs"("taskId", "startedAt");

