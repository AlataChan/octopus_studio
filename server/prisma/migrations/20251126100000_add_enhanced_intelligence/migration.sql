-- AlterTable: 添加 enhancedIntelligence 字段
-- 用于 Workspace 级别的"提升智能"开关
ALTER TABLE "workspaces" ADD COLUMN "enhancedIntelligence" BOOLEAN DEFAULT false;

