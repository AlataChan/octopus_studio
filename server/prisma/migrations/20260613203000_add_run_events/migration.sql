CREATE TABLE "run_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "run_events_runId_seq_key" ON "run_events"("runId", "seq");
CREATE INDEX "run_events_runId_createdAt_idx" ON "run_events"("runId", "createdAt");
