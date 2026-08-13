-- AlterTable
ALTER TABLE "assistant_templates" ADD COLUMN "platformConfig" TEXT;
ALTER TABLE "assistant_templates" ADD COLUMN "platformType" TEXT DEFAULT 'internal';
