-- CreateTable
CREATE TABLE "external_thread_state" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspace_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "external_app_id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "external_conversation_id" TEXT,
    "external_session_id" TEXT,
    "last_used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_thread_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "external_thread_state_workspace_id_platform_external_app_id_scope_key_key" ON "external_thread_state"("workspace_id", "platform", "external_app_id", "scope_key");

-- CreateIndex
CREATE INDEX "external_thread_state_workspace_id_platform_idx" ON "external_thread_state"("workspace_id", "platform");

-- CreateIndex
CREATE INDEX "external_thread_state_last_used_at_idx" ON "external_thread_state"("last_used_at");
