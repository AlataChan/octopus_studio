-- Migration: Add external platform support to assistant_templates
-- Date: 2025-01-20
-- Description: 添加 platformType 和 platformConfig 字段，支持集成 Dify 等外部智能体编排平台

-- Add platformType column (default: "internal")
ALTER TABLE assistant_templates 
ADD COLUMN IF NOT EXISTS "platformType" TEXT DEFAULT 'internal';

-- Add platformConfig column (stores JSON configuration)
ALTER TABLE assistant_templates 
ADD COLUMN IF NOT EXISTS "platformConfig" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN assistant_templates."platformType" IS 'Platform type: internal, dify, coze, fastgpt';
COMMENT ON COLUMN assistant_templates."platformConfig" IS 'JSON configuration for external platform: { baseUrl, apiKey, appId, ... }';

-- Update existing records to have platformType = 'internal'
UPDATE assistant_templates 
SET "platformType" = 'internal' 
WHERE "platformType" IS NULL;

