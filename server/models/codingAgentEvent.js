const prisma = require("../utils/prisma");
const { redactSecrets } = require("../utils/workAgent/security/policy");

const MAX_APPEND_RETRIES = 5;

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function redactPayload(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((entry) => redactPayload(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactPayload(entry)])
    );
  }
  return value;
}

function formatEvent(event) {
  if (!event) return null;
  return {
    ...event,
    payload: parsePayload(event.payload),
  };
}

function isSequenceConflict(error) {
  return error?.code === "P2002";
}

const CodingAgentEvent = {
  async append({ runId, type, payload = {} }) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt += 1) {
      try {
        const event = await prisma.$transaction(async (tx) => {
          const latest = await tx.coding_agent_events.findFirst({
            where: { runId },
            orderBy: { seq: "desc" },
            select: { seq: true },
          });
          const seq = (latest?.seq || 0) + 1;
          return tx.coding_agent_events.create({
            data: {
              runId,
              seq,
              type,
              payload: JSON.stringify(redactPayload(payload || {})),
            },
          });
        });
        return formatEvent(event);
      } catch (error) {
        if (!isSequenceConflict(error)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("Failed to append coding agent event");
  },

  async listByRun(runId, { limit = 200 } = {}) {
    const events = await prisma.coding_agent_events.findMany({
      where: { runId },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return events.map(formatEvent);
  },

  _formatEvent: formatEvent,
  _redactPayload: redactPayload,
};

module.exports = {
  CodingAgentEvent,
};
