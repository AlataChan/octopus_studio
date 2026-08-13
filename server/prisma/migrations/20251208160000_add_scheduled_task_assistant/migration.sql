-- 为定时任务添加 AI 员工关联字段
ALTER TABLE scheduled_tasks ADD COLUMN assistantId TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN threadSlug TEXT;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_assistant ON scheduled_tasks(assistantId);

