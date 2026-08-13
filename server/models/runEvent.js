const prisma = require("../utils/prisma");
const { redactFdeValue } = require("../utils/fde/redaction");

const BASE_TYPES = new Set([
  "step",
  "tool",
  "thinking",
  "status",
  "approval",
  "artifact",
  "cost",
]);
const RETRYABLE_PROVIDER_CODES = new Set(["P1008", "P2028", "P2034"]);

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function normalizeEventType(type, payload = {}) {
  const [base, ...rest] = String(type || "").split(".");
  if (!BASE_TYPES.has(base) || rest.length > 1) {
    const error = new Error("unsupported run event type");
    error.code = "RUN_EVENT_TYPE_INVALID";
    throw error;
  }
  const phase = rest[0] || null;
  return {
    base,
    payload: redactFdeValue(
      { ...payload, ...(phase ? { phase } : {}) },
      { maxDepth: 64 }
    ),
  };
}

function toTransportType(base, phase) {
  return phase ? `${base}.${phase}` : base;
}

function retryDelay(attempt) {
  return new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
}

function createRunEventModel(prismaClient = prisma) {
  return {
    TYPE: {
      STEP: "step",
      TOOL: "tool",
      THINKING: "thinking",
      STATUS: "status",
      APPROVAL: "approval",
      ARTIFACT: "artifact",
      COST: "cost",
    },

    async append({ runId, type, payload = {} }) {
      const normalized = normalizeEventType(type, payload);
      let event;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          event = await prismaClient.$transaction(async (tx) => {
            const { eventSeq } = await tx.runs.update({
              where: { id: runId },
              data: { eventSeq: { increment: 1 } },
              select: { eventSeq: true },
            });
            return tx.run_events.create({
              data: {
                runId,
                seq: eventSeq,
                type: normalized.base,
                payload: JSON.stringify(normalized.payload),
              },
            });
          });
          break;
        } catch (error) {
          if (!RETRYABLE_PROVIDER_CODES.has(error?.code) || attempt === 4) {
            throw error;
          }
          await retryDelay(attempt);
        }
      }
      return this._formatEvent(event, type);
    },

    async listByRun(runId, { limit = 200 } = {}) {
      const events = await prismaClient.run_events.findMany({
        where: { runId },
        orderBy: { seq: "asc" },
        take: limit,
      });
      return events.map((event) => this._formatEvent(event));
    },

    _formatEvent(event, originalType = null) {
      if (!event) return null;
      const payload = parsePayload(event.payload);
      return {
        ...event,
        type: originalType || toTransportType(event.type, payload.phase),
        payload,
      };
    },
  };
}

const RunEvent = createRunEventModel();

module.exports = {
  RunEvent,
  createRunEventModel,
  normalizeEventType,
  toTransportType,
};
