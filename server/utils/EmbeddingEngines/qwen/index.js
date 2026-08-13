const { toChunks } = require("../../helpers");

/**
 * Qwen (通义千问) Embedder
 * 阿里云提供的中文 embedding 模型
 *
 * 常用模型:
 * - text-embedding-v1 (中文, 1536维)
 * - text-embedding-v2 (中文增强, 1536维)
 * - text-embedding-v3 (最新版本, 1536维)
 *
 * API 文档: https://help.aliyun.com/zh/dashscope/developer-reference/text-embedding-api-details
 */
class QwenEmbedder {
  constructor() {
    if (!process.env.QWEN_API_KEY) throw new Error("No Qwen API key was set.");

    this.className = "QwenEmbedder";
    this.apiKey = process.env.QWEN_API_KEY;
    this.baseURL =
      process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";
    this.model = process.env.EMBEDDING_MODEL_PREF || "text-embedding-v2";

    // Qwen API 限制
    this.maxConcurrentChunks = 25; // 每次请求最多 25 个文本
    this.embeddingMaxChunkLength = 2048; // 最大 2048 tokens

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
          fetch(
            `${this.baseURL}/services/embeddings/text-embedding/text-embedding`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
              },
              body: JSON.stringify({
                model: this.model,
                input: {
                  texts: chunk,
                },
                parameters: {
                  text_type: "document", // document 或 query
                },
              }),
            }
          )
            .then((res) => res.json())
            .then((json) => {
              if (json.code) {
                // Qwen API 错误格式
                resolve({
                  data: [],
                  error: `[${json.code}]: ${json.message}`,
                });
              } else if (json.output && json.output.embeddings) {
                // 成功响应
                const embeddings = json.output.embeddings.map(
                  (item) => item.embedding
                );
                resolve({ data: embeddings, error: null });
              } else {
                resolve({
                  data: [],
                  error: "Unexpected response format from Qwen API",
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

    if (!!error) throw new Error(`Qwen Failed to embed: ${error}`);
    return data.length > 0 ? data : null;
  }
}

module.exports = {
  QwenEmbedder,
};
