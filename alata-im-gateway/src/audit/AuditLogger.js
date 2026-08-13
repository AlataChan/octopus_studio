const pino = require("pino");
const { getDb } = require("../db");

const logger = pino({ name: "audit", level: process.env.LOG_LEVEL || "info" });

const AuditLogger = {
  record({
    provider,
    eventId,
    direction,
    bindingId,
    peerId,
    senderId,
    workspaceSlug,
    threadSlug,
    status,
    errorType,
    latencyMs,
  }) {
    logger.info({ provider, direction, bindingId, peerId, status, latencyMs }, "message_event");

    try {
      getDb()
        .prepare(
          `
        INSERT INTO message_events
          (provider, event_id, direction, binding_id, peer_id, sender_id, workspace_slug, thread_slug, status, error_type, latency_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          provider,
          eventId,
          direction,
          bindingId,
          peerId,
          senderId,
          workspaceSlug,
          threadSlug,
          status,
          errorType,
          latencyMs,
          Date.now()
        );
    } catch (err) {
      logger.warn({ err }, "Failed to persist audit log (non-fatal)");
    }
  },
};

module.exports = { AuditLogger };

