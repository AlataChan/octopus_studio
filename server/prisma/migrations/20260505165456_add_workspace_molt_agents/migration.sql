-- CreateTable
CREATE TABLE "workspace_molt_agents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspace_id" INTEGER NOT NULL,
    "molt_agent_id" TEXT NOT NULL,
    "display_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_molt_agents_workspace_id_molt_agent_id_key" ON "workspace_molt_agents"("workspace_id", "molt_agent_id");

-- CreateIndex
CREATE INDEX "workspace_molt_agents_workspace_id_idx" ON "workspace_molt_agents"("workspace_id");
