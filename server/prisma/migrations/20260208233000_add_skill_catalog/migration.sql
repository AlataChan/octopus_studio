-- CreateTable
CREATE TABLE "skill_catalog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadataJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_catalog_skillId_source_key" ON "skill_catalog"("skillId", "source");

-- CreateIndex
CREATE INDEX "skill_catalog_source_enabled_idx" ON "skill_catalog"("source", "enabled");

