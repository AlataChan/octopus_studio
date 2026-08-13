-- AlterTable
ALTER TABLE "assistant_templates" ADD COLUMN "knowledgeModeTemplate" TEXT DEFAULT 'workspace';

-- AlterTable
ALTER TABLE "workspace_assistants" ADD COLUMN "knowledgeModeOverride" TEXT;
