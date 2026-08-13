const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { reqBody, multiUserMode } = require("../../utils/http");
const { Telemetry } = require("../../models/telemetry");
const { streamChatWithForEmbed } = require("../../utils/chats/embed");
const { EmbedChats } = require("../../models/embedChats");
const {
  validEmbedConfig,
  canRespond,
  setConnectionMeta,
} = require("../../utils/middleware/embedMiddleware");
const {
  convertToChatHistory,
  writeResponseChunk,
} = require("../../utils/helpers/chat/responses");
const { getPublicEmbedCorsConfig } = require("../../utils/corsConfig");

const publicEmbedCors = cors(getPublicEmbedCorsConfig());
const RESERVED_EMBED_ROUTE_SEGMENTS = new Set(["chats", "new", "update"]);

function publicEmbedCorsRoute(request, response, next) {
  const embedId = String(request.params?.embedId || "").toLowerCase();
  if (RESERVED_EMBED_ROUTE_SEGMENTS.has(embedId)) return next("route");
  return publicEmbedCors(request, response, () => {
    response.removeHeader("Access-Control-Allow-Credentials");
    next();
  });
}

function publicEmbedOptionsResponse(_request, response) {
  response.sendStatus(204);
}

function embeddedEndpoints(app) {
  if (!app) return;

  app.options("/embed/:embedId/stream-chat", [
    publicEmbedCorsRoute,
    publicEmbedOptionsResponse,
  ]);
  app.options("/embed/:embedId/:sessionId", [
    publicEmbedCorsRoute,
    publicEmbedOptionsResponse,
  ]);

  app.post(
    "/embed/:embedId/stream-chat",
    [publicEmbedCorsRoute, validEmbedConfig, setConnectionMeta, canRespond],
    async (request, response) => {
      try {
        const embed = response.locals.embedConfig;
        const {
          sessionId,
          message,
          // optional keys for override of defaults if enabled.
          prompt = null,
          model = null,
          temperature = null,
          username = null,
        } = reqBody(request);

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        await streamChatWithForEmbed(response, embed, message, sessionId, {
          promptOverride: prompt,
          modelOverride: model,
          temperatureOverride: temperature,
          username,
        });
        await Telemetry.sendTelemetry("embed_sent_chat", {
          multiUserMode: multiUserMode(response),
          LLMSelection: process.env.LLM_PROVIDER || "openai",
          Embedder: process.env.EMBEDDING_ENGINE || "inherit",
          VectorDbSelection: process.env.VECTOR_DB || "lancedb",
        });
        response.end();
      } catch (e) {
        console.error(e);
        writeResponseChunk(response, {
          id: uuidv4(),
          type: "abort",
          sources: [],
          textResponse: null,
          close: true,
          error: e.message,
        });
        response.end();
      }
    }
  );

  app.get(
    "/embed/:embedId/:sessionId",
    [publicEmbedCorsRoute, validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;
        const history = await EmbedChats.forEmbedByUser(
          embed.id,
          sessionId,
          null,
          null,
          true
        );

        response.status(200).json({ history: convertToChatHistory(history) });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/embed/:embedId/:sessionId",
    [publicEmbedCorsRoute, validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;

        await EmbedChats.markHistoryInvalid(embed.id, sessionId);
        response.status(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { embeddedEndpoints };
