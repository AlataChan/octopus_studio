/**
 * AiHubMix Image Provider - OpenAI compatible image generation
 *
 * Docs: https://docs.aihubmix.com/cn/api/Image-Gen
 *
 * Uses OpenAI-compatible endpoint:
 * - POST /v1/images/generations
 */

const { BaseImageProvider } = require("./base");

class AiHubMixImageProvider extends BaseImageProvider {
  #normalizeBaseUrl(value, fallbackUrl) {
    const fallback = String(fallbackUrl || "")
      .trim()
      .replace(/\/+$/, "");
    const raw = String(value || "").trim();
    const trimmed = (raw || fallback).trim().replace(/\/+$/, "");

    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    try {
      const origin = new URL(fallback).origin;
      if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
    } catch {
      // ignore
    }

    // Host without scheme (e.g. aihubmix.com/v1)
    return `https://${trimmed}`;
  }

  constructor() {
    super();
    this.name = "aihubmix";
    this.displayName = "AiHubMix";

    this.baseUrl = this.#normalizeBaseUrl(
      process.env.AIHUBMIX_BASE_PATH,
      "https://aihubmix.com/v1"
    );
    // Some AiHubMix image models (e.g. flux-kontext-*) return task IDs that must be polled via
    // `https://api.aihubmix.com/v1/tasks/<taskId>`.
    this.tasksBaseUrl = this.#normalizeBaseUrl(
      process.env.AIHUBMIX_TASKS_BASE_PATH,
      "https://api.aihubmix.com/v1"
    );
    this.apiKey = process.env.AIHUBMIX_API_KEY;

    this.capabilities = {
      t2i: true,
      i2i: false,
      inpaint: false,
      outpaint: false,
      removeBackground: false,
      upscale: false,
    };

    // The AiHubMix docs show many possible model IDs; we keep a small curated list
    // and allow callers to override via `options.model`.
    this.supportedModels = [
      { id: "bfl/flux-kontext-max", name: "Flux Kontext Max (async)" },
      { id: "bfl/flux-kontext-pro", name: "Flux Kontext Pro (async)" },
      { id: "FLUX.1-Kontext-pro", name: "FLUX.1 Kontext Pro" },
      { id: "FLUX-1.1-pro", name: "FLUX 1.1 Pro" },
      { id: "google/imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra" },
      {
        id: "google/imagen-4.0-fast-generate-preview-06-06",
        name: "Imagen 4 Preview",
      },
      { id: "google/imagen-4.0-fast-generate-001", name: "Imagen 4 Fast" },
      { id: "google/imagen-4.0-generate-001", name: "Imagen 4" },
      { id: "google/imagen-3.0-generate-002", name: "Imagen 3" },
      // Some deployments expose "Nano Banana Pro" under Gemini; user verified its model id.
      {
        id: "gemini-3-pro-image-preview",
        name: "Nano Banana Pro",
        default: true,
      },
      { id: "ideogram/V3", name: "Ideogram V3" },
      { id: "openai/gpt-image-1.5", name: "GPT Image 1.5" },
      { id: "openai/gpt-image-1", name: "GPT Image 1" },
      { id: "openai/gpt-image-1-mini", name: "GPT Image 1 Mini" },
      { id: "openai/dall-e-3", name: "DALL·E 3" },
    ];
  }

  static isAvailable() {
    return !!process.env.AIHUBMIX_API_KEY;
  }

  /**
   * Best-effort extract an error message from a non-2xx response.
   * @param {Response} response
   * @returns {Promise<string>}
   */
  async #responseErrorMessage(response) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }

    if (!bodyText) return response.statusText || "";

    try {
      const json = JSON.parse(bodyText);
      const message =
        json?.message ||
        json?.error?.message ||
        json?.error?.msg ||
        json?.msg ||
        json?.detail ||
        json?.error_description;
      return message || bodyText;
    } catch {
      return bodyText;
    }
  }

  /**
   * Whether the model supports the OpenAI `size` param on `/images/generations`.
   * AiHubMix's FLUX models can work without `size` (defaulting to 1024x1024).
   * @param {string} model
   * @returns {boolean}
   */
  #supportsSizeParam(model = "") {
    const normalized = String(model || "");
    return (
      normalized.startsWith("openai/") ||
      normalized.startsWith("gpt-image-") ||
      normalized.startsWith("dall-e-")
    );
  }

  /**
   * Map common aliases to AiHubMix documented model paths.
   * @param {string} model
   * @returns {string}
   */
  #normalizeModel(model = "") {
    const raw = String(model || "").trim();
    const normalized = raw.toLowerCase();
    if (normalized === "flux-kontext-max") return "bfl/flux-kontext-max";
    if (normalized === "flux-kontext-pro") return "bfl/flux-kontext-pro";
    // Some model lists expose an OpenAI-style FLUX name; route it to the BFL predictions API.
    if (normalized === "flux.1-kontext-pro") return "bfl/flux-kontext-pro";
    if (normalized === "gpt-image-1.5") return "openai/gpt-image-1.5";
    if (normalized === "gpt-image-1") return "openai/gpt-image-1";
    if (normalized === "gpt-image-1-mini") return "openai/gpt-image-1-mini";
    if (normalized === "dall-e-3") return "openai/dall-e-3";
    // Common UI aliases for Google Imagen
    if (normalized === "imagen-4.0-ultra")
      return "google/imagen-4.0-ultra-generate-001";
    if (normalized === "imagen-4.0-preview")
      return "google/imagen-4.0-fast-generate-preview-06-06";
    if (normalized === "imagen-4.0-fast")
      return "google/imagen-4.0-fast-generate-001";
    if (normalized === "imagen-4.0") return "google/imagen-4.0-generate-001";
    if (normalized === "imagen-3.0") return "google/imagen-3.0-generate-002";
    if (normalized === "nano banana pro" || normalized === "nano-banana-pro")
      return "gemini-3-pro-image-preview";
    if (normalized === "google/nano-banana-pro")
      return "gemini-3-pro-image-preview";

    // If caller passes a raw Imagen model without namespace, default to Google.
    if (!raw.includes("/") && normalized.startsWith("imagen-"))
      return `google/${raw}`;

    // Common UI aliases for Ideogram models
    if (normalized === "ideogram_v_3" || normalized === "ideogram_v3")
      return "ideogram/V3";
    if (normalized.startsWith("ideogram_v_")) {
      // ideogram_V_2_TURBO -> ideogram/V2_TURBO
      return `ideogram/${raw
        .replace(/^ideogram_/i, "")
        .replace(/^V_/, "V")
        .replace(/_/g, "_")}`;
    }
    return raw;
  }

  /**
   * AiHubMix has two image APIs:
   * - OpenAI-compatible `/images/generations` (best for OpenAI models and FLUX.1-Kontext-pro)
   * - Replicate-like `/models/<model_path>/predictions` (required for `bfl/flux-kontext-*`, google/*, ideogram/*)
   *
   * IMPORTANT: FLUX.1-Kontext-pro uses /images/generations endpoint (sync, fast)
   *            bfl/flux-kontext-* uses /models/xxx/predictions endpoint (async, polling)
   *
   * @param {string} model
   * @returns {boolean}
   */
  #shouldUsePredictionsApi(model = "") {
    const normalized = String(model || "").toLowerCase();

    // FLUX.1-Kontext-pro uses /images/generations endpoint (sync)
    if (normalized === "flux.1-kontext-pro") return false;
    if (normalized === "flux-1.1-pro") return false;

    // bfl/flux-kontext-* uses predictions endpoint (async)
    if (normalized.startsWith("bfl/flux-kontext-")) return true;
    // Google Imagen uses predictions endpoint
    if (normalized.startsWith("google/")) return true;
    // Ideogram uses predictions endpoint
    if (normalized.startsWith("ideogram/")) return true;
    // OpenAI models with namespace use predictions endpoint
    if (normalized.startsWith("openai/")) return true;

    // If model contains a namespace (e.g., "vendor/model"), use predictions API
    return normalized.includes("/");
  }

  /**
   * Some image-capable models are exposed via chat.completions (returning inline_data base64),
   * rather than the images or predictions APIs.
   * @param {string} model
   * @returns {boolean}
   */
  #shouldUseChatCompletionsApi(model = "") {
    const normalized = String(model || "").toLowerCase();
    return normalized === "gemini-3-pro-image-preview";
  }

  #encodeModelPath(modelPath = "") {
    return String(modelPath || "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  #gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  }

  #aspectRatioFromSize(width, height) {
    const w = Number(width) || 1;
    const h = Number(height) || 1;
    const g = this.#gcd(w, h);
    const rw = Math.max(1, Math.round(w / g));
    const rh = Math.max(1, Math.round(h / g));
    return `${rw}:${rh}`;
  }

  #normalizeOpenAiSize(width, height) {
    const w = Number(width) || 1024;
    const h = Number(height) || 1024;
    if (w === 1024 && h === 1024) return "1024x1024";
    if (w > h) return "1536x1024";
    if (h > w) return "1024x1536";
    return "1024x1024";
  }

  #sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  #looksLikeBase64(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (trimmed.length < 256) return false;
    if (this.#isHttpUrl(trimmed)) return false;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
    // Very conservative base64 heuristic: long, only base64 chars.
    return /^[A-Za-z0-9+/=]+$/.test(trimmed);
  }

  #isHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  #safeJsonParse(text) {
    if (typeof text !== "string" || text.trim().length === 0) return null;
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // Some providers may prepend/append non-JSON (rare). Try to recover the JSON portion.
      const firstBrace = trimmed.indexOf("{");
      const lastBrace = trimmed.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      const firstBracket = trimmed.indexOf("[");
      const lastBracket = trimmed.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  async #readResponsePayload(response) {
    const contentType = response.headers?.get?.("content-type") || "";
    const arrayBuffer = await response.arrayBuffer().catch(() => null);
    const buffer = arrayBuffer ? Buffer.from(arrayBuffer) : Buffer.from("");

    // Direct image response
    if (contentType.toLowerCase().startsWith("image/")) {
      return { contentType, buffer, json: null, text: "" };
    }

    const text = buffer.toString("utf8").trim();
    const json = this.#safeJsonParse(text);
    return { contentType, buffer, json, text };
  }

  /**
   * Extract image or task info from AiHubMix responses.
   * Supports:
   * - OpenAI-compatible: { data: [{ b64_json | url }] }
   * - AiHubMix generic: { output: [{ url }] }
   * - Async kickoff: { output: [{ taskId, polling_url }] }
   * @param {any} payload
   * @param {number} depth
   * @returns {{imageUrl?: string, imageBase64?: string, revisedPrompt?: string, taskId?: string}|null}
   */
  #extractImageCandidate(payload, depth = 0) {
    if (!payload || depth > 8) return null;

    if (typeof payload === "string") {
      if (this.#isHttpUrl(payload)) return { imageUrl: payload };
      const dataUri = payload.match(
        /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/
      );
      if (dataUri?.[1]) return { imageBase64: dataUri[1] };
      if (this.#looksLikeBase64(payload))
        return { imageBase64: payload.trim() };
      return null;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = this.#extractImageCandidate(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof payload !== "object") return null;

    // Common nested wrappers (Gemini-style, etc.)
    if (payload.inline_data) {
      const found = this.#extractImageCandidate(payload.inline_data, depth + 1);
      if (found) return found;
    }
    if (payload.inlineData) {
      const found = this.#extractImageCandidate(payload.inlineData, depth + 1);
      if (found) return found;
    }

    if (Array.isArray(payload.multi_mod_content)) {
      const found = this.#extractImageCandidate(
        payload.multi_mod_content,
        depth + 1
      );
      if (found) return found;
    }
    if (
      payload.multi_mod_content &&
      typeof payload.multi_mod_content === "object"
    ) {
      const found = this.#extractImageCandidate(
        payload.multi_mod_content,
        depth + 1
      );
      if (found) return found;
    }

    // OpenAI chat-style nesting (for Gemini image-preview via chat.completions)
    if (Array.isArray(payload.choices)) {
      const found = this.#extractImageCandidate(payload.choices, depth + 1);
      if (found) return found;
    }
    if (payload.message) {
      const found = this.#extractImageCandidate(payload.message, depth + 1);
      if (found) return found;
    }

    // Common image fields
    if (typeof payload.b64_json === "string" && payload.b64_json) {
      return {
        imageBase64: payload.b64_json,
        revisedPrompt: payload.revised_prompt,
      };
    }
    if (typeof payload.base64 === "string" && payload.base64) {
      return {
        imageBase64: payload.base64,
        revisedPrompt: payload.revised_prompt,
      };
    }
    // Some providers wrap base64 as bytesBase64 (e.g. output.b64_json[].bytesBase64)
    if (typeof payload.bytesBase64 === "string" && payload.bytesBase64) {
      return {
        imageBase64: payload.bytesBase64,
        revisedPrompt: payload.revised_prompt,
      };
    }

    // Task outputs may contain `urls: [ ... ]`
    if (Array.isArray(payload.urls)) {
      const found = this.#extractImageCandidate(payload.urls, depth + 1);
      if (found) return found;
    }

    // Some providers wrap images as arrays under `b64_json`
    if (Array.isArray(payload.b64_json)) {
      const found = this.#extractImageCandidate(payload.b64_json, depth + 1);
      if (found) return found;
    }

    // Gemini inline_data commonly uses `data` for base64 payloads.
    if (typeof payload.data === "string") {
      const found = this.#extractImageCandidate(payload.data, depth + 1);
      if (found) return found;
    }

    if (typeof payload.url === "string" && this.#isHttpUrl(payload.url)) {
      return { imageUrl: payload.url, revisedPrompt: payload.revised_prompt };
    }
    if (
      typeof payload.image_url === "string" &&
      this.#isHttpUrl(payload.image_url)
    ) {
      return {
        imageUrl: payload.image_url,
        revisedPrompt: payload.revised_prompt,
      };
    }
    if (
      typeof payload.imageUrl === "string" &&
      this.#isHttpUrl(payload.imageUrl)
    ) {
      return {
        imageUrl: payload.imageUrl,
        revisedPrompt: payload.revised_prompt,
      };
    }
    if (typeof payload.sample === "string" && this.#isHttpUrl(payload.sample)) {
      return {
        imageUrl: payload.sample,
        revisedPrompt: payload.revised_prompt,
      };
    }

    if (Array.isArray(payload.samples)) {
      const found = this.#extractImageCandidate(payload.samples, depth + 1);
      if (found) return found;
    }

    if (typeof payload.image === "string") {
      const found = this.#extractImageCandidate(payload.image, depth + 1);
      if (found) return found;
    }

    // OpenAI-style `data`
    if (Array.isArray(payload.data)) {
      const found = this.#extractImageCandidate(payload.data, depth + 1);
      if (found) return found;
    }
    if (payload.data && Array.isArray(payload.data.data)) {
      const found = this.#extractImageCandidate(payload.data.data, depth + 1);
      if (found) return found;
    }
    if (
      payload.data &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
    ) {
      const found = this.#extractImageCandidate(payload.data, depth + 1);
      if (found) return found;
    }

    // AiHubMix-style `output`
    if (Array.isArray(payload.output)) {
      const found = this.#extractImageCandidate(payload.output, depth + 1);
      if (found) return found;
    }
    if (payload.output && typeof payload.output === "object") {
      const found = this.#extractImageCandidate(payload.output, depth + 1);
      if (found) return found;
    }

    // Generic nesting
    if (payload.result) {
      const found = this.#extractImageCandidate(payload.result, depth + 1);
      if (found) return found;
    }
    if (payload.results) {
      const found = this.#extractImageCandidate(payload.results, depth + 1);
      if (found) return found;
    }

    // Async task kickoff (fallback when no image is present)
    if (typeof payload.taskId === "string" && payload.taskId) {
      return { taskId: payload.taskId };
    }

    return null;
  }

  #isFailureStatus(status) {
    const normalized = String(status || "").toLowerCase();
    return (
      normalized === "failed" ||
      normalized === "error" ||
      normalized === "canceled" ||
      normalized === "cancelled"
    );
  }

  async #resolveTask(taskId) {
    const timeoutMsRaw = parseInt(process.env.AIHUBMIX_TASK_TIMEOUT_MS, 10);
    const pollIntervalMsRaw = parseInt(
      process.env.AIHUBMIX_TASK_POLL_INTERVAL_MS,
      10
    );
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? timeoutMsRaw
        : 120_000;
    const pollIntervalMs =
      Number.isFinite(pollIntervalMsRaw) && pollIntervalMsRaw > 0
        ? pollIntervalMsRaw
        : 1_500;

    const taskUrl = `${this.tasksBaseUrl}/tasks/${taskId}`;
    const startedAt = Date.now();
    let lastStatus = null;

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(taskUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const message = await this.#responseErrorMessage(response);
        throw new Error(message || `HTTP ${response.status}`);
      }

      const taskData = await response.json().catch(() => ({}));
      const extracted = this.#extractImageCandidate(taskData);
      if (extracted?.imageUrl || extracted?.imageBase64) return extracted;

      lastStatus =
        taskData?.status ||
        taskData?.state ||
        taskData?.task_status ||
        taskData?.taskStatus ||
        taskData?.result?.status;

      if (this.#isFailureStatus(lastStatus)) {
        const message =
          taskData?.error?.message ||
          taskData?.message ||
          taskData?.detail ||
          `Task failed: ${taskId}`;
        throw new Error(message);
      }

      await this.#sleep(pollIntervalMs);
    }

    throw new Error(
      `Timed out waiting for task: ${taskId}${lastStatus ? ` (status: ${lastStatus})` : ""}`
    );
  }

  async generate(request, options = {}) {
    const {
      prompt,
      negativePrompt,
      width = 1024,
      height = 1024,
      n = 1,
      // Some AiHubMix models support extra params (e.g. safety_tolerance/background/moderation).
      // We pass through a curated subset to avoid sending unknown keys.
      safety_tolerance,
      quality,
      style,
      background,
      moderation,
      image,
    } = request;

    const model = this.#normalizeModel(
      options.model ||
        this.supportedModels.find((m) => m.default)?.id ||
        this.supportedModels[0]?.id
    );

    try {
      this.log(`Generating image with ${model}, size: ${width}x${height}`);

      // ==========================================================
      // Chat-completions image models (e.g., Gemini image preview)
      // ==========================================================
      if (this.#shouldUseChatCompletionsApi(model)) {
        const promptParts = [String(prompt || "").trim()].filter(Boolean);
        if (
          typeof negativePrompt === "string" &&
          negativePrompt.trim().length > 0
        ) {
          promptParts.push(`Negative prompt: ${negativePrompt.trim()}`);
        }

        // Best-effort: include requested size as a hint (if the backend ignores it, result size may differ).
        if (Number(width) && Number(height)) {
          promptParts.push(`Size: ${width}x${height}`);
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: promptParts.join("\n") }],
            max_tokens: 1024,
          }),
        });

        if (!response.ok) {
          const message = await this.#responseErrorMessage(response);
          throw new Error(message || `HTTP ${response.status}`);
        }

        const parsed = await this.#readResponsePayload(response);
        const payload = parsed.json ?? parsed.text;
        const apiMessage =
          parsed.json?.error?.message ||
          parsed.json?.message ||
          parsed.json?.detail;
        const extracted = this.#extractImageCandidate(payload);
        if (!extracted) {
          const hint =
            parsed.json && typeof parsed.json === "object"
              ? `Response keys: ${Object.keys(parsed.json).slice(0, 12).join(", ")}`
              : parsed.text
                ? `Response text: ${parsed.text.slice(0, 120)}`
                : `content-type: ${parsed.contentType || "unknown"}`;
          throw new Error(apiMessage || `No image returned from API. ${hint}`);
        }

        if (extracted.taskId) {
          const resolved = await this.#resolveTask(extracted.taskId);
          if (resolved.imageBase64) {
            return {
              success: true,
              imageBuffer: Buffer.from(resolved.imageBase64, "base64"),
              revisedPrompt: resolved.revisedPrompt,
              metadata: {
                model,
                taskId: extracted.taskId,
                channel: "chat.completions",
              },
            };
          }
          if (resolved.imageUrl) {
            return {
              success: true,
              imageUrl: resolved.imageUrl,
              revisedPrompt: resolved.revisedPrompt,
              metadata: {
                model,
                taskId: extracted.taskId,
                channel: "chat.completions",
              },
            };
          }
          throw new Error(apiMessage || "No image returned from API");
        }

        if (extracted.imageBase64) {
          return {
            success: true,
            imageBuffer: Buffer.from(extracted.imageBase64, "base64"),
            revisedPrompt: extracted.revisedPrompt,
            metadata: { model, channel: "chat.completions" },
          };
        }

        if (extracted.imageUrl) {
          return {
            success: true,
            imageUrl: extracted.imageUrl,
            revisedPrompt: extracted.revisedPrompt,
            metadata: { model, channel: "chat.completions" },
          };
        }

        throw new Error(apiMessage || "No image data returned from API");
      }

      // ==========================================================
      // Model-path predictions API (recommended by AiHubMix docs)
      // ==========================================================
      if (this.#shouldUsePredictionsApi(model)) {
        const normalizedModel = String(model || "").toLowerCase();
        const input = { prompt };
        const meta = { model };

        if (normalizedModel.startsWith("bfl/flux-kontext-")) {
          input.aspect_ratio = this.#aspectRatioFromSize(width, height);
          meta.aspect_ratio = input.aspect_ratio;

          if (typeof safety_tolerance === "number")
            input.safety_tolerance = safety_tolerance;
          if (
            typeof negativePrompt === "string" &&
            negativePrompt.trim().length > 0
          ) {
            input.negative_prompt = negativePrompt.trim();
          }
          if (typeof image === "string" && image.trim().length > 0) {
            input.image = image.trim();
          }
        } else if (normalizedModel.startsWith("openai/")) {
          input.size = this.#normalizeOpenAiSize(width, height);
          input.n = n;
          meta.size = input.size;

          if (typeof quality === "string") input.quality = quality;
          if (typeof style === "string") input.style = style;
          if (typeof background === "string") input.background = background;
          if (typeof moderation === "string") input.moderation = moderation;
        } else if (normalizedModel.startsWith("google/")) {
          // AiHubMix docs for Imagen use `numberOfImages`.
          input.numberOfImages = n;
        } else if (normalizedModel.startsWith("ideogram/")) {
          // Ideogram V3 example uses `rendering_speed` and `aspect_ratio` like "2x1".
          input.rendering_speed = "QUALITY";
          const ratio = this.#aspectRatioFromSize(width, height).replace(
            ":",
            "x"
          );
          input.aspect_ratio = ratio;
          meta.aspect_ratio = ratio;
        }

        const predictionsUrl = `${this.baseUrl}/models/${this.#encodeModelPath(
          model
        )}/predictions`;

        const response = await fetch(predictionsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ input }),
        });

        if (!response.ok) {
          const message = await this.#responseErrorMessage(response);
          throw new Error(message || `HTTP ${response.status}`);
        }

        const parsed = await this.#readResponsePayload(response);
        if (
          parsed.contentType.toLowerCase().startsWith("image/") &&
          parsed.buffer?.length
        ) {
          return {
            success: true,
            imageBuffer: parsed.buffer,
            metadata: { ...meta },
          };
        }

        const payload = parsed.json ?? parsed.text;
        const apiMessage =
          parsed.json?.error?.message ||
          parsed.json?.message ||
          parsed.json?.detail;

        const extracted = this.#extractImageCandidate(payload);
        if (!extracted) {
          const hint =
            parsed.json && typeof parsed.json === "object"
              ? `Response keys: ${Object.keys(parsed.json).slice(0, 12).join(", ")}`
              : parsed.text
                ? `Response text: ${parsed.text.slice(0, 120)}`
                : `content-type: ${parsed.contentType || "unknown"}`;
          throw new Error(apiMessage || `No image returned from API. ${hint}`);
        }

        if (extracted.taskId) {
          const resolved = await this.#resolveTask(extracted.taskId);
          if (resolved.imageBase64) {
            return {
              success: true,
              imageBuffer: Buffer.from(resolved.imageBase64, "base64"),
              revisedPrompt: resolved.revisedPrompt,
              metadata: {
                ...meta,
                taskId: extracted.taskId,
              },
            };
          }
          if (resolved.imageUrl) {
            return {
              success: true,
              imageUrl: resolved.imageUrl,
              revisedPrompt: resolved.revisedPrompt,
              metadata: {
                ...meta,
                taskId: extracted.taskId,
              },
            };
          }
          throw new Error(apiMessage || "No image returned from API");
        }

        if (extracted.imageBase64) {
          return {
            success: true,
            imageBuffer: Buffer.from(extracted.imageBase64, "base64"),
            revisedPrompt: extracted.revisedPrompt,
            metadata: {
              ...meta,
            },
          };
        }

        if (extracted.imageUrl) {
          return {
            success: true,
            imageUrl: extracted.imageUrl,
            revisedPrompt: extracted.revisedPrompt,
            metadata: {
              ...meta,
            },
          };
        }

        throw new Error(apiMessage || "No image data returned from API");
      }

      // ==========================================================
      // OpenAI-compatible images/generations API
      // ==========================================================
      const body = {
        model,
        prompt,
        n,
      };

      // FLUX models need safety_tolerance (default 6 = most permissive)
      const normalizedModel = String(model || "").toLowerCase();
      const isFluxModel =
        normalizedModel.includes("flux") || normalizedModel.includes("kontext");

      if (this.#supportsSizeParam(model)) {
        body.size = `${width}x${height}`;
      }

      // Set safety_tolerance for FLUX models (default to 6 if not specified)
      if (isFluxModel) {
        body.safety_tolerance =
          typeof safety_tolerance === "number" ? safety_tolerance : 6;
      } else if (typeof safety_tolerance === "number") {
        body.safety_tolerance = safety_tolerance;
      }
      if (typeof quality === "string") body.quality = quality;
      if (typeof style === "string") body.style = style;
      if (typeof background === "string") body.background = background;
      if (typeof moderation === "string") body.moderation = moderation;
      if (typeof image === "string") body.image = image;

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await this.#responseErrorMessage(response);
        throw new Error(message || `HTTP ${response.status}`);
      }

      const parsed = await this.#readResponsePayload(response);
      if (
        parsed.contentType.toLowerCase().startsWith("image/") &&
        parsed.buffer?.length
      ) {
        return {
          success: true,
          imageBuffer: parsed.buffer,
          metadata: {
            model,
            size: body.size || `${width}x${height}`,
          },
        };
      }

      const payload = parsed.json ?? parsed.text;
      const apiMessage =
        parsed.json?.error?.message ||
        parsed.json?.message ||
        parsed.json?.detail;

      const extracted = this.#extractImageCandidate(payload);
      if (!extracted) {
        // For some models (e.g. FLUX.*), `/images/generations` can return a non-standard shape.
        // Fallback to the model-path predictions API if possible.
        const modelLower = String(model || "").toLowerCase();
        if (modelLower.startsWith("flux")) {
          const input = { prompt };
          if (typeof safety_tolerance === "number")
            input.safety_tolerance = safety_tolerance;
          input.aspect_ratio = this.#aspectRatioFromSize(width, height);
          if (
            typeof negativePrompt === "string" &&
            negativePrompt.trim().length > 0
          ) {
            input.negative_prompt = negativePrompt.trim();
          }
          if (typeof image === "string" && image.trim().length > 0)
            input.image = image.trim();

          const predictionsUrl = `${this.baseUrl}/models/${this.#encodeModelPath(
            model
          )}/predictions`;

          const predRes = await fetch(predictionsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ input }),
          });

          if (!predRes.ok) {
            const message = await this.#responseErrorMessage(predRes);
            throw new Error(message || apiMessage || `HTTP ${predRes.status}`);
          }

          const predParsed = await this.#readResponsePayload(predRes);
          if (
            predParsed.contentType.toLowerCase().startsWith("image/") &&
            predParsed.buffer?.length
          ) {
            return {
              success: true,
              imageBuffer: predParsed.buffer,
              metadata: {
                model,
                aspect_ratio: input.aspect_ratio,
              },
            };
          }

          const predPayload = predParsed.json ?? predParsed.text;
          const predMessage =
            predParsed.json?.error?.message ||
            predParsed.json?.message ||
            predParsed.json?.detail ||
            apiMessage;
          const predExtracted = this.#extractImageCandidate(predPayload);
          if (!predExtracted) {
            const hint =
              predParsed.json && typeof predParsed.json === "object"
                ? `Response keys: ${Object.keys(predParsed.json).slice(0, 12).join(", ")}`
                : predParsed.text
                  ? `Response text: ${predParsed.text.slice(0, 120)}`
                  : `content-type: ${predParsed.contentType || "unknown"}`;
            throw new Error(
              predMessage || `No image returned from API. ${hint}`
            );
          }

          if (predExtracted.taskId) {
            const resolved = await this.#resolveTask(predExtracted.taskId);
            if (resolved.imageBase64) {
              return {
                success: true,
                imageBuffer: Buffer.from(resolved.imageBase64, "base64"),
                revisedPrompt: resolved.revisedPrompt,
                metadata: {
                  model,
                  aspect_ratio: input.aspect_ratio,
                  taskId: predExtracted.taskId,
                },
              };
            }
            if (resolved.imageUrl) {
              return {
                success: true,
                imageUrl: resolved.imageUrl,
                revisedPrompt: resolved.revisedPrompt,
                metadata: {
                  model,
                  aspect_ratio: input.aspect_ratio,
                  taskId: predExtracted.taskId,
                },
              };
            }
            throw new Error(predMessage || "No image returned from API");
          }

          if (predExtracted.imageBase64) {
            return {
              success: true,
              imageBuffer: Buffer.from(predExtracted.imageBase64, "base64"),
              revisedPrompt: predExtracted.revisedPrompt,
              metadata: {
                model,
                aspect_ratio: input.aspect_ratio,
              },
            };
          }

          if (predExtracted.imageUrl) {
            return {
              success: true,
              imageUrl: predExtracted.imageUrl,
              revisedPrompt: predExtracted.revisedPrompt,
              metadata: {
                model,
                aspect_ratio: input.aspect_ratio,
              },
            };
          }
        }

        const hint =
          parsed.json && typeof parsed.json === "object"
            ? `Response keys: ${Object.keys(parsed.json).slice(0, 12).join(", ")}`
            : parsed.text
              ? `Response text: ${parsed.text.slice(0, 120)}`
              : `content-type: ${parsed.contentType || "unknown"}`;
        throw new Error(apiMessage || `No image returned from API. ${hint}`);
      }

      // Async response: poll task until ready.
      if (extracted.taskId) {
        const resolved = await this.#resolveTask(extracted.taskId);
        if (resolved.imageBase64) {
          return {
            success: true,
            imageBuffer: Buffer.from(resolved.imageBase64, "base64"),
            revisedPrompt: resolved.revisedPrompt,
            metadata: {
              model,
              size: body.size || `${width}x${height}`,
              taskId: extracted.taskId,
            },
          };
        }
        if (resolved.imageUrl) {
          return {
            success: true,
            imageUrl: resolved.imageUrl,
            revisedPrompt: resolved.revisedPrompt,
            metadata: {
              model,
              size: body.size || `${width}x${height}`,
              taskId: extracted.taskId,
            },
          };
        }
        throw new Error(apiMessage || "No image returned from API");
      }

      if (extracted.imageBase64) {
        return {
          success: true,
          imageBuffer: Buffer.from(extracted.imageBase64, "base64"),
          revisedPrompt: extracted.revisedPrompt,
          metadata: {
            model,
            size: body.size || `${width}x${height}`,
          },
        };
      }

      if (extracted.imageUrl) {
        return {
          success: true,
          imageUrl: extracted.imageUrl,
          revisedPrompt: extracted.revisedPrompt,
          metadata: {
            model,
            size: body.size || `${width}x${height}`,
          },
        };
      }

      throw new Error(apiMessage || "No image data returned from API");
    } catch (error) {
      this.log(`Error generating image: ${error.message}`);
      throw new Error(`AiHubMix image generation failed: ${error.message}`);
    }
  }

  log(text, ...args) {
    console.log(`\x1b[36m[AiHubMixImageProvider]\x1b[0m ${text}`, ...args);
  }
}

module.exports = { AiHubMixImageProvider };
