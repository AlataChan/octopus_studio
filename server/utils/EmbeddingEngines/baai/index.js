const { toChunks, maximumChunkLength } = require("../../helpers");

/**
 * BAAI (Beijing Academy of Artificial Intelligence) Embedder
 * 支持两种部署模式:
 * 1. 本地部署 (通过 Ollama) - 推荐用于私有化部署
 * 2. API 调用 (通过 BAAI API) - 需要 API Key
 *
 * 常用模型:
 * - bge-large-zh-v1.5 (中文最佳, 1024维)
 * - bge-base-zh-v1.5 (中文, 768维)
 * - bge-small-zh-v1.5 (中文轻量, 512维)
 * - bge-large-en-v1.5 (英文)
 */
class BAAIEmbedder {
  constructor() {
    // 检查部署模式
    this.useOllama = process.env.BAAI_USE_OLLAMA === "true";
    this.className = "BAAIEmbedder";

    if (this.useOllama) {
      // 本地部署模式 (通过 Ollama)
      if (!process.env.EMBEDDING_BASE_PATH)
        throw new Error("No embedding base path was set for BAAI Ollama mode.");
      if (!process.env.EMBEDDING_MODEL_PREF)
        throw new Error("No embedding model was set for BAAI Ollama mode.");

      let Ollama;
      try {
        ({ Ollama } = require("ollama"));
      } catch (error) {
        throw new Error(
          [
            "BAAI embedder (Ollama mode) requires the optional dependency `ollama`.",
            "Install it with `yarn workspace anything-llm-server add ollama` (and set LIGHTWEIGHT_MODE=false to enable local engines), or use BAAI API mode instead.",
            error?.message || error,
          ]
            .filter(Boolean)
            .join(" ")
        );
      }
      this.basePath = process.env.EMBEDDING_BASE_PATH;
      this.model = process.env.EMBEDDING_MODEL_PREF;
      this.client = new Ollama({ host: this.basePath });
      this.maxConcurrentChunks = 1; // Ollama 逐个处理
      this.embeddingMaxChunkLength = maximumChunkLength();

      this.log(
        `Initialized in Ollama mode with model ${this.model} at ${this.basePath}`
      );
    } else {
      // API 调用模式
      if (!process.env.BAAI_API_KEY)
        throw new Error("No BAAI API key was set.");

      this.apiKey = process.env.BAAI_API_KEY;
      this.baseURL = process.env.BAAI_BASE_URL || "https://api.baai.ac.cn/v1";
      this.model = process.env.EMBEDDING_MODEL_PREF || "bge-large-zh-v1.5";
      this.maxConcurrentChunks = 50; // API 批量处理
      this.embeddingMaxChunkLength = 512; // BAAI 模型默认最大长度

      this.log(
        `Initialized in API mode with model ${this.model} at ${this.baseURL}`
      );
    }
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  /**
   * 检查服务是否可用
   */
  async #isAlive() {
    if (this.useOllama) {
      return await fetch(this.basePath)
        .then((res) => res.ok)
        .catch((e) => {
          this.log(e.message);
          return false;
        });
    } else {
      // API 模式暂不检查连通性,直接返回 true
      return true;
    }
  }

  async embedTextInput(textInput) {
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  async embedChunks(textChunks = []) {
    if (!(await this.#isAlive())) {
      const service = this.useOllama ? "Ollama" : "BAAI API";
      throw new Error(`${service} service could not be reached.`);
    }

    this.log(
      `Embedding ${textChunks.length} chunks of text with ${this.model}.`
    );

    if (this.useOllama) {
      return await this.#embedWithOllama(textChunks);
    } else {
      return await this.#embedWithAPI(textChunks);
    }
  }

  /**
   * 通过 Ollama 本地部署进行 embedding
   */
  async #embedWithOllama(textChunks) {
    let data = [];
    let error = null;

    for (const chunk of textChunks) {
      try {
        const res = await this.client.embeddings({
          model: this.model,
          prompt: chunk,
          options: {
            num_ctx: this.embeddingMaxChunkLength,
          },
        });

        const { embedding } = res;
        if (!Array.isArray(embedding) || embedding.length === 0)
          throw new Error("BAAI Ollama returned an empty embedding for chunk!");

        data.push(embedding);
      } catch (err) {
        this.log(err.message);
        error = err.message;
        data = [];
        break;
      }
    }

    if (!!error) throw new Error(`BAAI Ollama Failed to embed: ${error}`);
    return data.length > 0 ? data : null;
  }

  /**
   * 通过 API 调用进行 embedding
   */
  async #embedWithAPI(textChunks) {
    const embeddingRequests = [];

    for (const chunk of toChunks(textChunks, this.maxConcurrentChunks)) {
      embeddingRequests.push(
        new Promise((resolve) => {
          fetch(`${this.baseURL}/embeddings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: this.model,
              input: chunk,
            }),
          })
            .then((res) => res.json())
            .then((json) => {
              if (json.error) {
                resolve({ data: [], error: json.error });
              } else {
                const embeddings = json.data.map((item) => item.embedding);
                resolve({ data: embeddings, error: null });
              }
            })
            .catch((e) => {
              resolve({ data: [], error: e.message });
            });
        })
      );
    }

    const { data = [], error = null } = await Promise.all(
      embeddingRequests
    ).then((results) => {
      const errors = results
        .filter((res) => !!res.error)
        .map((res) => res.error)
        .flat();

      if (errors.length > 0) {
        return { data: [], error: errors.join(", ") };
      }

      return {
        data: results.map((res) => res?.data || []).flat(),
        error: null,
      };
    });

    if (!!error) throw new Error(`BAAI API Failed to embed: ${error}`);
    return data.length > 0 ? data : null;
  }
}

module.exports = {
  BAAIEmbedder,
};
