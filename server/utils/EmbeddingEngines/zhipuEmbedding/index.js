const { toChunks } = require("../../helpers");

/**
 * Zhipu AI (智谱 AI) Embedder
 * 智谱 AI 提供的中文 embedding 模型
 *
 * 常用模型:
 * - embedding-2 (中文, 1024维)
 * - embedding-3 (最新版本, 2048维)
 *
 * API 文档: https://open.bigmodel.cn/dev/api#text_embedding
 */
class ZhipuEmbedder {
  constructor() {
    if (!process.env.ZHIPU_API_KEY)
      throw new Error("No Zhipu AI API key was set.");

    this.className = "ZhipuEmbedder";
    this.apiKey = process.env.ZHIPU_API_KEY;
    this.baseURL =
      process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
    this.model = process.env.EMBEDDING_MODEL_PREF || "embedding-2";

    // Zhipu API 限制
    this.maxConcurrentChunks = 50; // 批量处理
    this.embeddingMaxChunkLength = 512; // 最大 512 tokens

    this.log(`Initialized with model ${this.model} at ${this.baseURL}`);
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  async embedTextInput(textInput) {
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  async embedChunks(textChunks = []) {
    this.log(
      `Embedding ${textChunks.length} chunks of text with ${this.model}.`
    );

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
                // 错误响应
                resolve({
                  data: [],
                  error: `[${json.error.code}]: ${json.error.message}`,
                });
              } else if (json.data) {
                // 成功响应 - 智谱 API 返回格式与 OpenAI 兼容
                const embeddings = json.data.map((item) => item.embedding);
                resolve({ data: embeddings, error: null });
              } else {
                resolve({
                  data: [],
                  error: "Unexpected response format from Zhipu AI API",
                });
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
        let uniqueErrors = new Set();
        errors.forEach((error) => uniqueErrors.add(error));
        return { data: [], error: Array.from(uniqueErrors).join(", ") };
      }

      return {
        data: results.map((res) => res?.data || []).flat(),
        error: null,
      };
    });

    if (!!error) throw new Error(`Zhipu AI Failed to embed: ${error}`);
    return data.length > 0 ? data : null;
  }
}

module.exports = {
  ZhipuEmbedder,
};
