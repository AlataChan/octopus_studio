const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");

function normalizeJSON(input = null) {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    return JSON.stringify(safeJsonParse(input, { raw: input }));
  }
  return JSON.stringify(input);
}

const ChannelMessageEvent = {
  async create(data = {}) {
    try {
      return await prisma.channel_message_events.create({
        data: {
          provider: String(data.provider),
          accountId: String(data.accountId),
          eventId: String(data.eventId),
          messageId: data.messageId ? String(data.messageId) : null,
          direction: String(data.direction || "inbound"),
          bindingId: data.bindingId ? String(data.bindingId) : null,
          sessionKey: data.sessionKey ? String(data.sessionKey) : null,
          agentId: data.agentId ? String(data.agentId) : null,
          status: String(data.status || "queued"),
          errorType: data.errorType ? String(data.errorType) : null,
          errorMessage: data.errorMessage ? String(data.errorMessage) : null,
          latencyMs:
            typeof data.latencyMs === "number"
              ? Math.max(0, data.latencyMs)
              : null,
          payloadJson: normalizeJSON(data.payload),
        },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        return { duplicate: true };
      }
      console.error("[ChannelMessageEvent] create failed:", error.message);
      throw error;
    }
  },

  async updateStatus(id, updates = {}) {
    try {
      return await prisma.channel_message_events.update({
        where: { id: Number(id) },
        data: {
          bindingId:
            updates.bindingId === undefined
              ? undefined
              : updates.bindingId
                ? String(updates.bindingId)
                : null,
          sessionKey:
            updates.sessionKey === undefined
              ? undefined
              : updates.sessionKey
                ? String(updates.sessionKey)
                : null,
          agentId:
            updates.agentId === undefined
              ? undefined
              : updates.agentId
                ? String(updates.agentId)
                : null,
          status:
            updates.status === undefined ? undefined : String(updates.status),
          errorType:
            updates.errorType === undefined
              ? undefined
              : updates.errorType
                ? String(updates.errorType)
                : null,
          errorMessage:
            updates.errorMessage === undefined
              ? undefined
              : updates.errorMessage
                ? String(updates.errorMessage)
                : null,
          latencyMs:
            updates.latencyMs === undefined
              ? undefined
              : typeof updates.latencyMs === "number"
                ? Math.max(0, updates.latencyMs)
                : null,
          payloadJson:
            updates.payload === undefined
              ? undefined
              : normalizeJSON(updates.payload),
        },
      });
    } catch (error) {
      console.error(
        "[ChannelMessageEvent] updateStatus failed:",
        error.message
      );
      return null;
    }
  },
};

module.exports = { ChannelMessageEvent };
