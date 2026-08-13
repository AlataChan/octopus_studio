const {
  reconcileAttachedAgents,
  softDeleteStaleAttachments,
} = require("./orphanCleanup");

function createMoltOrphanScheduler({
  reconcile = reconcileAttachedAgents,
  softDelete = softDeleteStaleAttachments,
  logger = console,
} = {}) {
  let started = false;
  let reconcileTimer = null;
  let softDeleteTimer = null;

  async function safeReconcile() {
    try {
      return await reconcile();
    } catch (error) {
      logger.warn?.("[MoltOrphanScheduler] reconcile failed:", error.message);
      return { skipped: true, error: error.message };
    }
  }

  async function safeSoftDelete() {
    try {
      return await softDelete();
    } catch (error) {
      logger.warn?.("[MoltOrphanScheduler] soft delete failed:", error.message);
      return { skipped: true, error: error.message };
    }
  }

  return {
    start({
      reconcileIntervalMs = 300_000,
      softDeleteIntervalMs = 86_400_000,
    } = {}) {
      if (started) return { started: true, alreadyRunning: true };
      started = true;

      safeReconcile();

      reconcileTimer = setInterval(safeReconcile, reconcileIntervalMs);
      reconcileTimer.unref?.();

      softDeleteTimer = setInterval(safeSoftDelete, softDeleteIntervalMs);
      softDeleteTimer.unref?.();

      return {
        started: true,
        reconcileIntervalMs,
        softDeleteIntervalMs,
      };
    },

    stop() {
      if (reconcileTimer) clearInterval(reconcileTimer);
      if (softDeleteTimer) clearInterval(softDeleteTimer);
      reconcileTimer = null;
      softDeleteTimer = null;
      started = false;
    },
  };
}

const MoltOrphanScheduler = createMoltOrphanScheduler();

module.exports = {
  createMoltOrphanScheduler,
  MoltOrphanScheduler,
};
