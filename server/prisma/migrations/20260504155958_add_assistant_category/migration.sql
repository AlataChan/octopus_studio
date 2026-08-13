-- Add nullable seed classifications for production assistant seeding policy.
-- assistant_templates.category already stores the user-facing display category
-- (for example, "通用基础"), so official/demo/test classification is stored
-- separately in seedCategory.
ALTER TABLE "assistant_templates" ADD COLUMN "seedCategory" TEXT;
ALTER TABLE "workspace_assistants" ADD COLUMN "category" TEXT;

CREATE INDEX "assistant_templates_seedCategory_idx" ON "assistant_templates"("seedCategory");
CREATE INDEX "workspace_assistants_category_idx" ON "workspace_assistants"("category");
