-- CreateTable
CREATE TABLE "gateway_runtimes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "authTokenHash" TEXT NOT NULL,
    "capabilitiesJson" TEXT,
    "metadataJson" TEXT,
    "lastHeartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "gateway_runtime_heartbeats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runtimeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metricsJson" TEXT,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gateway_runtime_heartbeats_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "gateway_runtimes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "gateway_runtime_heartbeats_runtimeId_observedAt_idx" ON "gateway_runtime_heartbeats"("runtimeId", "observedAt");
