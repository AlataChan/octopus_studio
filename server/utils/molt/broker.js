const { MoltHealthMonitor } = require("./healthMonitor");

const DEFAULT_AGENT_ID = process.env.MOLT_DEFAULT_AGENT_ID || "molt-matrix";

function monitorAvailable(monitor) {
  if (!monitor?.client) return false;
  if (typeof monitor.isAvailable === "function") return monitor.isAvailable();
  return monitor.isAvailable === true;
}

function unavailable() {
  return {
    success: false,
    code: "MOLT_UNAVAILABLE",
    error: "Molt is not connected",
  };
}

function normalizeFailure(result, fallbackCode) {
  return {
    success: false,
    code: result?.code || fallbackCode,
    error: result?.error || "Molt request failed",
    ...(result?.statusCode ? { statusCode: result.statusCode } : {}),
    ...(result?.body ? { details: result.body } : {}),
  };
}

function normalizeAgents(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.agents)) return result.agents;
  return [];
}

function normalizeAnswer(result) {
  return (
    result?.answer ||
    result?.data?.answer ||
    result?.message ||
    result?.text ||
    ""
  );
}

function normalizeConversationId(result) {
  return (
    result?.conversation_id ||
    result?.conversationId ||
    result?.data?.conversation_id ||
    result?.data?.conversationId ||
    null
  );
}

function normalizeChatId(result) {
  return (
    result?.chat_id ||
    result?.chatId ||
    result?.data?.chat_id ||
    result?.data?.chatId ||
    null
  );
}

function isThreadNotFound(result) {
  return (
    result?.statusCode === 404 ||
    result?.code === "THREAD_NOT_FOUND" ||
    result?.code === "MOLT_THREAD_NOT_FOUND" ||
    result?.body?.code === "THREAD_NOT_FOUND"
  );
}

function createThreadStaleError() {
  const error = new Error("Molt thread not found");
  error.code = "thread_stale";
  error.statusCode = 409;
  return error;
}

function createBrokerError(result, fallbackCode) {
  const error = new Error(result?.error || "Molt request failed");
  error.code = result?.code || fallbackCode;
  error.statusCode = result?.statusCode || 503;
  error.details = result?.body;
  return error;
}

function createMoltBroker({
  monitor = MoltHealthMonitor.getInstance(),
  defaultAgentId = DEFAULT_AGENT_ID,
} = {}) {
  function clientOrNull() {
    if (!monitorAvailable(monitor)) return null;
    return monitor.client;
  }

  return {
    status() {
      const status =
        typeof monitor?.status === "function" ? monitor.status() : {};
      return {
        success: true,
        available: monitorAvailable(monitor),
        ...status,
      };
    },

    async listAgents() {
      const client = clientOrNull();
      if (!client) return unavailable();
      const result = await client.listAgents();
      if (result?.ok === false) {
        return normalizeFailure(result, "MOLT_AGENTS_ERROR");
      }
      return {
        success: true,
        agents: normalizeAgents(result),
        raw: result,
      };
    },

    async listArchetypes() {
      const client = clientOrNull();
      if (!client) return unavailable();
      const result = await client.matrixArchetypes();
      if (result?.ok === false) {
        return normalizeFailure(result, "MOLT_ARCHETYPES_ERROR");
      }
      return {
        success: true,
        archetypes: Array.isArray(result?.data) ? result.data : [],
        raw: result,
      };
    },

    async askAgent({
      agentId = defaultAgentId,
      message,
      userId = "alata-agent",
      userName = "Alata Agent",
      userExtra = {},
      conversationId = null,
      responseMode = "blocking",
    } = {}) {
      const client = clientOrNull();
      if (!client) return unavailable();
      if (!message || !String(message).trim()) {
        return {
          success: false,
          code: "MOLT_MESSAGE_REQUIRED",
          error: "message is required",
        };
      }

      const result = await client.chatAgent(agentId, {
        message,
        user: {
          id: String(userId || "alata-agent"),
          name: String(userName || "Alata Agent"),
          extra: userExtra || {},
        },
        conversationId,
        responseMode,
      });
      if (result?.ok === false) {
        return normalizeFailure(result, "MOLT_AGENT_CHAT_ERROR");
      }
      return {
        success: true,
        answer: normalizeAnswer(result),
        conversationId: normalizeConversationId(result),
        raw: result,
      };
    },

    async chat({
      agentId = defaultAgentId,
      message,
      threadId = null,
      scopeKey = null,
      userId = "alata-agent",
      userName = "Alata Agent",
      responseMode = "blocking",
    } = {}) {
      const client = clientOrNull();
      if (!client) return unavailable();
      if (!message || !String(message).trim()) {
        return {
          success: false,
          code: "MOLT_MESSAGE_REQUIRED",
          error: "message is required",
        };
      }

      try {
        const result = await client.chatAgent(agentId, {
          message,
          user: {
            id: String(userId || "alata-agent"),
            name: String(userName || "Alata Agent"),
            extra: scopeKey ? { scopeKey } : {},
          },
          conversationId: threadId,
          responseMode,
        });

        if (result?.ok === false) {
          if (isThreadNotFound(result)) {
            return {
              success: false,
              threadStale: true,
              code: "molt_thread_stale",
              error: "Molt thread not found",
              statusCode: 409,
            };
          }
          return normalizeFailure(result, "MOLT_AGENT_CHAT_ERROR");
        }

        return {
          success: true,
          reply: normalizeAnswer(result),
          molt_thread_id: normalizeConversationId(result),
          chatId: normalizeChatId(result),
          raw: result,
        };
      } catch (error) {
        return {
          success: false,
          code: "MOLT_AGENT_CHAT_ERROR",
          error: error.message,
          statusCode: 503,
        };
      }
    },

    async streamChat({
      moltAgentId = null,
      agentId = defaultAgentId,
      message,
      threadId = null,
      scopeKey = null,
      userId = "alata-agent",
      userName = "Alata Agent",
      onChunk = () => {},
      signal = undefined,
    } = {}) {
      const client = clientOrNull();
      if (!client) throw createBrokerError(unavailable(), "MOLT_UNAVAILABLE");
      if (!message || !String(message).trim()) {
        throw createBrokerError(
          {
            code: "MOLT_MESSAGE_REQUIRED",
            error: "message is required",
            statusCode: 400,
          },
          "MOLT_MESSAGE_REQUIRED"
        );
      }

      const resolvedAgentId = moltAgentId || agentId;
      const result = await client.streamChatAgent(resolvedAgentId, {
        message,
        user: {
          id: String(userId || "alata-agent"),
          name: String(userName || "Alata Agent"),
          extra: scopeKey ? { scopeKey } : {},
        },
        conversationId: threadId,
        responseMode: "streaming",
        onChunk,
        signal,
      });

      if (result?.ok === false) {
        if (isThreadNotFound(result)) throw createThreadStaleError();
        throw createBrokerError(result, "MOLT_AGENT_STREAM_ERROR");
      }

      return {
        chatId: normalizeChatId(result),
        molt_thread_id: normalizeConversationId(result),
        raw: result,
      };
    },
  };
}

let singleton = null;
function getMoltBroker(options = null) {
  if (options) return createMoltBroker(options);
  if (!singleton) singleton = createMoltBroker();
  return singleton;
}

module.exports = { createMoltBroker, getMoltBroker };
