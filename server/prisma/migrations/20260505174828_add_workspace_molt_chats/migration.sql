-- CreateTable
CREATE TABLE "workspace_molt_chats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspace_id" INTEGER NOT NULL,
    "molt_agent_id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "created_by_user_id" INTEGER,
    "molt_thread_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_user_message_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_molt_chats_workspace_id_molt_agent_id_scope_key_key" ON "workspace_molt_chats"("workspace_id", "molt_agent_id", "scope_key");

-- CreateIndex
CREATE INDEX "workspace_molt_chats_workspace_id_created_by_user_id_idx" ON "workspace_molt_chats"("workspace_id", "created_by_user_id");
