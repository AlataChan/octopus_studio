/**
 * SSE event names (server → client).
 * Keep this list small; detailed Work Agent steps are multiplexed through run.event.
 */
const SSE_EVENTS = {
  SESSION_SUBSCRIBE: "session.subscribe",
  RUN_CREATED: "run.created",
  RUN_UPDATED: "run.updated",
  RUN_COMPLETED: "run.completed",
  RUN_BLOCKED: "run.blocked",
  RUN_EVENT: "run.event",
  ARTIFACT_CREATED: "artifact.created",
  CANVAS_SURFACE_UPDATE: "canvas.surfaceUpdate",
  CANVAS_SURFACE_CLEAR: "canvas.surfaceClear",
  CANVAS_USER_ACTION: "canvas.userAction",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_RESOLVED: "approval.resolved",
  PING: "ping",
};

module.exports = { SSE_EVENTS };
