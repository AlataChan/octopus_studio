"use strict";

const fs = require("fs");
const path = require("path");
const { Blob, File } = require("node:buffer");
const { jsonrepair } = require("jsonrepair");

const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
// Vision-capable Moonshot model. moonshot-v1-* are text-only and reject
// video_url content; kimi-k2.6 / kimi-latest accept native video input.
const DEFAULT_MODEL = "kimi-k2.6";

const VIDEO_SUMMARY_PROMPT = [
  "Analyze the attached video and return only valid JSON with this shape:",
  "{",
  '  "transcript": "speech transcript or empty string",',
  '  "sceneTimeline": [',
  '    { "tStart": 0, "tEnd": 0, "description": "scene description" }',
  "  ],",
  '  "keyObservations": ["important visual or audio observations"]',
  "}",
  "Use seconds for tStart and tEnd. Do not include markdown fences.",
].join("\n");

const MIME_TO_EXT = {
  "video/mp4": "mp4",
  "video/mpeg": "mpeg",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/x-flv": "flv",
  "video/3gpp": "3gp",
};

const EXT_TO_MIME = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime])
);

class MoonshotVideoAdapter {
  static supportsVideo = true;

  constructor({
    client = null,
    apiKey = process.env.MOONSHOT_AI_API_KEY,
    baseURL = process.env.MOONSHOT_AI_BASE_URL || MOONSHOT_BASE_URL,
    model = process.env.MOONSHOT_AI_VIDEO_MODEL_PREF ||
      process.env.MOONSHOT_AI_MODEL_PREF ||
      DEFAULT_MODEL,
  } = {}) {
    if (!client && !apiKey) throw new Error("No Moonshot AI API key was set.");

    this.provider = "moonshot";
    this.model = model;
    this.client =
      client ||
      new (require("openai").OpenAI)({
        baseURL,
        apiKey,
      });
  }

  async uploadVideo(input) {
    const { data, filename, mimeType } = await normalizeUploadInput(input);
    if (!mimeType?.startsWith("video/")) {
      throw new Error(
        `Expected a video mime type, got ${mimeType || "unknown"}`
      );
    }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const blob = new Blob([bytes], { type: mimeType });
    const file = new File([blob], filename || guessFilename(mimeType), {
      type: mimeType,
    });

    const uploaded = await this.client.files.create({
      file,
      purpose: "video",
    });

    return { sourceRef: `ms://${uploaded.id}` };
  }

  async understand({ sourceRef }) {
    const response = await this.client.chat.completions.create({
      // No hardcoded temperature: some vision models (e.g. kimi-k2.6) only
      // accept temperature=1, so we let the model use its own default.
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "video_url",
              video_url: { url: sourceRef },
            },
            {
              type: "text",
              text: VIDEO_SUMMARY_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response?.choices?.[0]?.message?.content || "";
    return normalizeSummary(parseSummaryContent(content), {
      provider: this.provider,
      sourceRef,
      fallbackText: content,
    });
  }
}

async function normalizeUploadInput(input) {
  if (typeof input === "string") {
    const filename = path.basename(input);
    const mimeType = guessMimeTypeFromExt(filename);
    if (!mimeType?.startsWith("video/")) {
      throw new Error(
        `Expected a video mime type, got ${mimeType || "unknown"}`
      );
    }
    return {
      data: await fs.promises.readFile(input),
      filename,
      mimeType,
    };
  }

  const mimeType = input.mimeType || input.mime;
  const filename = input.filename || input.name || guessFilename(mimeType);

  if (input.data) {
    return {
      data: Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data),
      filename,
      mimeType,
    };
  }

  if (input.contentString) {
    return {
      data: decodeContentString(input.contentString),
      filename,
      mimeType,
    };
  }

  if (input.path) {
    return {
      data: await fs.promises.readFile(input.path),
      filename: filename || path.basename(input.path),
      mimeType: mimeType || guessMimeTypeFromExt(input.path),
    };
  }

  throw new Error(
    "Video upload input must include data, contentString, or path."
  );
}

function decodeContentString(contentString) {
  const marker = ";base64,";
  const markerIndex = contentString.indexOf(marker);
  const encoded =
    markerIndex >= 0
      ? contentString.slice(markerIndex + marker.length)
      : contentString;
  return Buffer.from(encoded, "base64");
}

function parseSummaryContent(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate =
    fenced?.[1]?.trim() || extractJsonObject(trimmed) || trimmed;

  try {
    return JSON.parse(candidate);
  } catch (_) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch (_) {
      return null;
    }
  }
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeSummary(parsed, { provider, sourceRef, fallbackText }) {
  if (!parsed || typeof parsed !== "object") {
    return {
      transcript: "",
      sceneTimeline: [],
      keyObservations: fallbackText ? [fallbackText] : [],
      meta: { provider, sourceRef },
    };
  }

  return {
    transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
    sceneTimeline: Array.isArray(parsed.sceneTimeline)
      ? parsed.sceneTimeline
          .map((scene) => ({
            tStart: Number(scene?.tStart ?? 0),
            tEnd: Number(scene?.tEnd ?? 0),
            description:
              typeof scene?.description === "string" ? scene.description : "",
          }))
          .filter((scene) => scene.description)
      : [],
    keyObservations: Array.isArray(parsed.keyObservations)
      ? parsed.keyObservations
          .filter((observation) => typeof observation === "string")
          .map((observation) => observation.trim())
          .filter(Boolean)
      : [],
    meta: {
      ...(parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}),
      provider,
      sourceRef,
    },
  };
}

function guessFilename(mimeType) {
  const ext = MIME_TO_EXT[String(mimeType || "").toLowerCase()] || "bin";
  return `upload.${ext}`;
}

function guessMimeTypeFromExt(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXT_TO_MIME[filename.slice(dot + 1).toLowerCase()];
}

module.exports = {
  MoonshotVideoAdapter,
  VIDEO_SUMMARY_PROMPT,
};
