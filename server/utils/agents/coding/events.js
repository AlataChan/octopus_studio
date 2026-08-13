const { EventEmitter } = require("node:events");
const { redactSecrets } = require("../../workAgent/security/policy");

const CODING_EVENT_TYPES = Object.freeze([
  "coding.run.created",
  "coding.sandbox.created",
  "coding.model.delta",
  "coding.reasoning.delta",
  "coding.tool.requested",
  "coding.tool.approval_required",
  "coding.tool.started",
  "coding.tool.progress",
  "coding.tool.completed",
  "coding.tool.failed",
  "coding.patch.created",
  "coding.run.completed",
  "coding.run.failed",
  "coding.run.cancelled",
]);

function redactPayload(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactPayload(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactPayload(entry)])
    );
  }
  return value;
}

class CodingEventSink extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.sequence = 0;
  }

  record(type, payload = {}) {
    if (!CODING_EVENT_TYPES.includes(type)) {
      throw new Error(`Unknown coding event type: ${type}`);
    }
    const event = {
      sequence: ++this.sequence,
      type,
      payload: redactPayload(payload),
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    this.emit("event", event);
    return event;
  }

  all() {
    return [...this.events];
  }
}

module.exports = {
  CODING_EVENT_TYPES,
  CodingEventSink,
  redactPayload,
};
