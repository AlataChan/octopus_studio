const { MoltHealthMonitor } = require("./healthMonitor");
const { createKmBridge } = require("./kmBridge");

let timer = null;

function syncEnabled() {
  return process.env.MOLT_SYNC_ENABLED === "true";
}

async function runMoltBridgeSyncOnce({
  kmBridge = null,
  logger = console,
} = {}) {
  if (!syncEnabled()) {
    return {
      success: true,
      skipped: true,
      reason: "MOLT_SYNC_ENABLED=false",
    };
  }

  const bridge =
    kmBridge ||
    createKmBridge({ client: MoltHealthMonitor.getInstance().client });
  const status = await bridge.status();
  if (!status.success) {
    logger.warn?.("[MoltSync] status sync skipped:", status.error);
    return status;
  }

  // Phase 4 intentionally starts as status-only. Real content mirroring is
  // guarded by MOLT_SYNC_ENABLED and should be expanded after live Molt data
  // shape is observed in production.
  return {
    success: true,
    synced: 0,
    mode: "status-only",
    km: status.km,
  };
}

function startMoltBridgeSyncJob({
  intervalMs = Number(process.env.MOLT_SYNC_INTERVAL_MS || 300_000),
  logger = console,
} = {}) {
  if (!syncEnabled()) {
    return {
      started: false,
      reason: "MOLT_SYNC_ENABLED=false",
    };
  }
  if (timer) return { started: true, alreadyRunning: true };

  const safeIntervalMs = Number.isFinite(intervalMs)
    ? Math.max(60_000, intervalMs)
    : 300_000;
  timer = setInterval(() => {
    runMoltBridgeSyncOnce({ logger }).catch((error) => {
      logger.warn?.("[MoltSync] periodic sync failed:", error.message);
    });
  }, safeIntervalMs);
  timer.unref?.();

  runMoltBridgeSyncOnce({ logger }).catch((error) => {
    logger.warn?.("[MoltSync] initial sync failed:", error.message);
  });
  return { started: true, intervalMs: safeIntervalMs };
}

function stopMoltBridgeSyncJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  runMoltBridgeSyncOnce,
  startMoltBridgeSyncJob,
  stopMoltBridgeSyncJob,
};
