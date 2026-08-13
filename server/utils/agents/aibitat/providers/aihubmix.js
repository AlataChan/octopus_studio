const OpenAI = require("openai");
const Provider = require("./ai-provider.js");
const InheritMultiple = require("./helpers/classes.js");
const UnTooled = require("./helpers/untooled.js");
const { toValidNumber } = require("../../../http/index.js");
const { getAlataUserAgent } = require("../../../../endpoints/utils");

/**
 * The agent provider for AiHubMix (OpenAI-compatible).
 *
 * AiHubMix routes OpenAI-compatible requests to multiple upstream models.
 * Since tool calling support varies by selected model, we wrap it in `UnTooled`
 * (same approach as Generic OpenAI) for better compatibility.
 */
class AiHubMixProvider extends InheritMultiple([Provider, UnTooled]) {
  model;

  constructor(config = {}) {
    super();
    const { model = process.env.AIHUBMIX_MODEL_PREF ?? "gpt-4o-mini" } = config;

    const baseURL = (
      process.env.AIHUBMIX_BASE_PATH || "https://aihubmix.com/v1"
    )
      .trim()
      .replace(/\/+$/, "");

    const client = new OpenAI({
      baseURL,
      apiKey: process.env.AIHUBMIX_API_KEY ?? null,
      maxRetries: 3,
      defaultHeaders: {
        "User-Agent": getAlataUserAgent(),
      },
    });

    this._client = client;
    this.model = model;
    this.verbose = true;
    this.maxTokens = process.env.AIHUBMIX_MAX_TOKENS
      ? toValidNumber(process.env.AIHUBMIX_MAX_TOKENS, 1024)
      : 1024;
  }

  get client() {
    return this._client;
  }

  get supportsAgentStreaming() {
    if (process.env.AIHUBMIX_STREAMING_DISABLED === "true") return false;
    return true;
  }

  async #handleFunctionCallChat({ messages = [] }) {
    return await this.client.chat.completions
      .create({
        model: this.model,
        temperature: 0,
        messages,
        max_tokens: this.maxTokens,
      })
      .then((result) => {
        if (!result.hasOwnProperty("choices"))
          throw new Error("AiHubMix chat: No results!");
        if (result.choices.length === 0)
          throw new Error("AiHubMix chat: No results length!");
        return result.choices[0].message.content;
      })
      .catch((_) => {
        return null;
      });
  }

  async #handleFunctionCallStream({ messages = [] }) {
    return await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
    });
  }

  async stream(messages, functions = [], eventHandler = null) {
    return await UnTooled.prototype.stream.call(
      this,
      messages,
      functions,
      this.#handleFunctionCallStream.bind(this),
      eventHandler
    );
  }

  async complete(messages, functions = []) {
    return await UnTooled.prototype.complete.call(
      this,
      messages,
      functions,
      this.#handleFunctionCallChat.bind(this)
    );
  }

  getCost(_usage) {
    return 0;
  }
}

module.exports = AiHubMixProvider;
