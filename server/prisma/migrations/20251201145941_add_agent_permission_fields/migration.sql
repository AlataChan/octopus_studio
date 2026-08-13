-- AlterTable
ALTER TABLE "assistant_templates" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "defaultAllowedTools" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "defaultAutoApprovedTools" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "defaultPermissionMode" TEXT DEFAULT 'default';
ALTER TABLE "assistant_templates" ADD COLUMN "originPath" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "pluginType" TEXT DEFAULT 'agent';
ALTER TABLE "assistant_templates" ADD COLUMN "resourceScopes" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "sourceType" TEXT DEFAULT 'builtin';
ALTER TABLE "assistant_templates" ADD COLUMN "version" TEXT;

-- CreateIndex
CREATE INDEX "assistant_templates_sourceType_pluginType_idx" ON "assistant_templates"("sourceType", "pluginType");

-- CreateIndex
CREATE INDEX "assistant_templates_contentHash_idx" ON "assistant_templates"("contentHash");
