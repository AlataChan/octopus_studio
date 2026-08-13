ALTER TABLE "workspaces" ADD COLUMN "disableTierRouting" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "tier_routing_preview_tokens" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" INTEGER NOT NULL,
    "tierMapHash" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "tier_routing_preview_tokens_adminUserId_idx" ON "tier_routing_preview_tokens"("adminUserId");
CREATE INDEX "tier_routing_preview_tokens_expiresAt_idx" ON "tier_routing_preview_tokens"("expiresAt");
