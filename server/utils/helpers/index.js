/**
 * File Attachment for automatic upload on the chat container page.
 * @typedef Attachment
 * @property {string} name - the given file name
 * @property {string} mime - the given file mime
 * @property {string} contentString - full base64 encoded string of file
 */

/**
 * @typedef {Object} ResponseMetrics
 * @property {number} prompt_tokens - The number of prompt tokens used
 * @property {number} completion_tokens - The number of completion tokens used
 * @property {number} total_tokens - The total number of tokens used
 * @property {number} outputTps - The output tokens per second
 * @property {number} duration - The duration of the request in seconds
 *
 * @typedef {Object} ChatMessage
 * @property {string} role - The role of the message sender (e.g. 'user', 'assistant', 'system')
 * @property {string} content - The content of the message
 *
 * @typedef {Object} ChatCompletionResponse
 * @property {string} textResponse - The text response from the LLM
 * @property {ResponseMetrics} metrics - The response metrics
 *
 * @typedef {Object} ChatCompletionOptions
 * @property {number} temperature - The sampling temperature for the LLM response
 *
 * @typedef {function(Array<ChatMessage>, ChatCompletionOptions): Promise<ChatCompletionResponse>} getChatCompletionFunction
 *
 * @typedef {function(Array<ChatMessage>, ChatCompletionOptions): Promise<import("./chat/LLMPerformanceMonitor").MonitoredStream>} streamGetChatCompletionFunction
 */

/**
 * @typedef {Object} BaseLLMProvider - A basic llm provider object
 * @property {Function} streamingEnabled - Checks if streaming is enabled for chat completions.
 * @property {Function} promptWindowLimit - Returns the token limit for the current model.
 * @property {Function} isValidChatCompletionModel - Validates if the provided model is suitable for chat completion.
 * @property {Function} constructPrompt - Constructs a formatted prompt for the chat completion request.
 * @property {getChatCompletionFunction} getChatCompletion - Gets a chat completion response from OpenAI.
 * @property {streamGetChatCompletionFunction} streamGetChatCompletion - Streams a chat completion response from OpenAI.
 * @property {Function} handleStream - Handles the streaming response.
 * @property {Function} embedTextInput - Embeds the provided text input using the specified embedder.
 * @property {Function} embedChunks - Embeds multiple chunks of text using the specified embedder.
 * @property {Function} compressMessages - Compresses chat messages to fit within the token limit.
 */

/**
 * @typedef {Object} BaseLLMProviderClass - Class method of provider - not instantiated
 * @property {function(string): number} promptWindowLimit - Returns the token limit for the provided model.
 */

/**
 * @typedef {Object} BaseVectorDatabaseProvider
 * @property {string} name - The name of the Vector Database instance.
 * @property {Function} connect - Connects to the Vector Database client.
 * @property {Function} totalVectors - Returns the total number of vectors in the database.
 * @property {Function} namespaceCount - Returns the count of vectors in a given namespace.
 * @property {Function} similarityResponse - Performs a similarity search on a given namespace.
 * @property {Function} rerankedSimilarityResponse - Performs a similarity search on a given namespace with reranking (if supported by provider).
 * @property {Function} namespace - Retrieves the specified namespace collection.
 * @property {Function} hasNamespace - Checks if a namespace exists.
 * @property {Function} namespaceExists - Verifies if a namespace exists in the client.
 * @property {Function} deleteVectorsInNamespace - Deletes all vectors in a specified namespace.
 * @property {Function} deleteDocumentFromNamespace - Deletes a document from a specified namespace.
 * @property {Function} addDocumentToNamespace - Adds a document to a specified namespace.
 * @property {Function} performSimilaritySearch - Performs a similarity search in the namespace.
 */

/**
 * @typedef {Object} BaseEmbedderProvider
 * @property {string} model - The model used for embedding.
 * @property {number} maxConcurrentChunks - The maximum number of chunks processed concurrently.
 * @property {number} embeddingMaxChunkLength - The maximum length of each chunk for embedding.
 * @property {Function} embedTextInput - Embeds a single text input.
 * @property {Function} embedChunks - Embeds multiple chunks of text.
 */

/**
 * Gets the systems current vector database provider.
 * @param {('pinecone' | 'chroma' | 'chromacloud' | 'lancedb' | 'weaviate' | 'qdrant' | 'milvus' | 'zilliz' | 'astra') | null} getExactly - If provided, this will return an explit provider.
 * @returns { BaseVectorDatabaseProvider}
 */
const { isLightweightMode } = require("./lightweightMode");

function missingOptionalDependencyMessage({ feature, packageName, extra }) {
  const installHint = packageName
    ? `Install it with \`yarn workspace anything-llm-server add ${packageName}\`.`
    : "Install the required optional dependency.";
  return [
    `${feature} is not available in Lite by default.`,
    packageName ? `Missing optional dependency: ${packageName}.` : null,
    installHint,
    extra || null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getVectorDbClass(getExactly = null) {
  const vectorSelection = getExactly ?? process.env.VECTOR_DB ?? "lancedb";
  switch (vectorSelection) {
    case "pinecone":
      try {
        const { Pinecone } = require("../vectorDbProviders/pinecone");
        return Pinecone;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Pinecone vector database provider",
            packageName: "@pinecone-database/pinecone",
            extra: error?.message,
          })
        );
      }
    case "chroma":
      try {
        const { Chroma } = require("../vectorDbProviders/chroma");
        return Chroma;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Chroma vector database provider",
            packageName: "chromadb",
            extra: error?.message,
          })
        );
      }
    case "chromacloud":
      try {
        const { ChromaCloud } = require("../vectorDbProviders/chromacloud");
        return ChromaCloud;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Chroma Cloud vector database provider",
            packageName: "chromadb",
            extra: error?.message,
          })
        );
      }
    case "lancedb":
      const { LanceDb } = require("../vectorDbProviders/lance");
      return LanceDb;
    case "weaviate":
      try {
        const { Weaviate } = require("../vectorDbProviders/weaviate");
        return Weaviate;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Weaviate vector database provider",
            packageName: "weaviate-ts-client",
            extra: error?.message,
          })
        );
      }
    case "qdrant":
      try {
        const { QDrant } = require("../vectorDbProviders/qdrant");
        return QDrant;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Qdrant vector database provider",
            packageName: "@qdrant/js-client-rest",
            extra: error?.message,
          })
        );
      }
    case "milvus":
      try {
        const { Milvus } = require("../vectorDbProviders/milvus");
        return Milvus;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Milvus vector database provider",
            packageName: "@zilliz/milvus2-sdk-node",
            extra: error?.message,
          })
        );
      }
    case "zilliz":
      try {
        const { Zilliz } = require("../vectorDbProviders/zilliz");
        return Zilliz;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Zilliz Cloud vector database provider",
            packageName: "@zilliz/milvus2-sdk-node",
            extra: error?.message,
          })
        );
      }
    case "astra":
      try {
        const { AstraDB } = require("../vectorDbProviders/astra");
        return AstraDB;
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "AstraDB vector database provider",
            packageName: "@datastax/astra-db-ts",
            extra: error?.message,
          })
        );
      }
    case "pgvector":
      const { PGVector } = require("../vectorDbProviders/pgvector");
      return PGVector;
    default:
      throw new Error("ENV: No VECTOR_DB value found in environment!");
  }
}

/**
 * Returns the LLMProvider with its embedder attached via system or via defined provider.
 * @param {{provider: string | null, model: string | null} | null} params - Initialize params for LLMs provider
 * @returns {BaseLLMProvider}
 */
function getLLMProvider({ provider = null, model = null } = {}) {
  const LLMSelection = provider ?? process.env.LLM_PROVIDER ?? "hireagent";
  const embedder = getEmbeddingEngineSelection();

  if (isLightweightMode() && ["ollama", "lmstudio"].includes(LLMSelection)) {
    throw new Error(
      `LLM provider "${LLMSelection}" is disabled in LIGHTWEIGHT_MODE. Set LIGHTWEIGHT_MODE=false to enable local providers.`
    );
  }

  switch (LLMSelection) {
    case "openai":
      const { OpenAiLLM } = require("../AiProviders/openAi");
      return new OpenAiLLM(embedder, model);
    case "azure":
      const { AzureOpenAiLLM } = require("../AiProviders/azureOpenAi");
      return new AzureOpenAiLLM(embedder, model);
    case "anthropic":
      const { AnthropicLLM } = require("../AiProviders/anthropic");
      return new AnthropicLLM(embedder, model);
    case "gemini":
      const { GeminiLLM } = require("../AiProviders/gemini");
      return new GeminiLLM(embedder, model);
    case "lmstudio":
      const { LMStudioLLM } = require("../AiProviders/lmStudio");
      return new LMStudioLLM(embedder, model);
    case "ollama":
      try {
        const { OllamaAILLM } = require("../AiProviders/ollama");
        return new OllamaAILLM(embedder, model);
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Ollama LLM provider",
            packageName: "ollama",
            extra: error?.message,
          })
        );
      }
    case "openrouter":
      const { OpenRouterLLM } = require("../AiProviders/openRouter");
      return new OpenRouterLLM(embedder, model);
    case "generic-openai":
      const { GenericOpenAiLLM } = require("../AiProviders/genericOpenAi");
      return new GenericOpenAiLLM(embedder, model);
    case "aihubmix":
      const { AiHubMixLLM } = require("../AiProviders/aihubmix");
      return new AiHubMixLLM(embedder, model);
    case "deepseek":
      const { DeepSeekLLM } = require("../AiProviders/deepseek");
      return new DeepSeekLLM(embedder, model);
    case "moonshotai":
      const { MoonshotAiLLM } = require("../AiProviders/moonshotAi");
      return new MoonshotAiLLM(embedder, model);
    case "zhipu":
      const { ZhipuAiLLM } = require("../AiProviders/zhipuAi");
      return new ZhipuAiLLM(embedder, model);
    case "minimax":
      const { MiniMaxLLM } = require("../AiProviders/minimax");
      return new MiniMaxLLM(embedder, model);
    case "siliconflow":
      const { SiliconFlowLLM } = require("../AiProviders/siliconflow");
      return new SiliconFlowLLM(embedder, model);
    case "hireagent":
      const { HireAgentLLM } = require("../AiProviders/hireagent");
      return new HireAgentLLM(embedder, model);
    default:
      throw new Error(
        `ENV: No valid LLM_PROVIDER value found in environment! Using ${process.env.LLM_PROVIDER}`
      );
  }
}

/**
 * Returns the EmbedderProvider by itself to whatever is currently in the system settings.
 * @returns {BaseEmbedderProvider}
 */
function getEmbeddingEngineSelection() {
  const { NativeEmbedder } = require("../EmbeddingEngines/native");
  const engineSelection = process.env.EMBEDDING_ENGINE;

  if (isLightweightMode()) {
    // Disallow local engines in Lite mode unless explicitly disabled.
    if (!engineSelection) {
      // Heuristic: pick the first configured cloud embedder.
      if (process.env.JINA_API_KEY) {
        const { JinaEmbedder } = require("../EmbeddingEngines/jina");
        return new JinaEmbedder();
      }
      if (process.env.OPEN_AI_KEY) {
        const { OpenAiEmbedder } = require("../EmbeddingEngines/openAi");
        return new OpenAiEmbedder();
      }
      if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY) {
        const {
          AzureOpenAiEmbedder,
        } = require("../EmbeddingEngines/azureOpenAi");
        return new AzureOpenAiEmbedder();
      }
      if (process.env.COHERE_API_KEY) {
        const { CohereEmbedder } = require("../EmbeddingEngines/cohere");
        return new CohereEmbedder();
      }
      if (process.env.VOYAGEAI_API_KEY) {
        const { VoyageAiEmbedder } = require("../EmbeddingEngines/voyageAi");
        return new VoyageAiEmbedder();
      }
      if (
        process.env.EMBEDDING_BASE_PATH &&
        process.env.GENERIC_OPEN_AI_EMBEDDING_API_KEY
      ) {
        const {
          GenericOpenAiEmbedder,
        } = require("../EmbeddingEngines/genericOpenAi");
        return new GenericOpenAiEmbedder();
      }
      if (process.env.GEMINI_API_KEY) {
        const { GeminiEmbedder } = require("../EmbeddingEngines/gemini");
        return new GeminiEmbedder();
      }
      if (process.env.ZHIPU_API_KEY) {
        const { ZhipuEmbedder } = require("../EmbeddingEngines/zhipuEmbedding");
        return new ZhipuEmbedder();
      }

      throw new Error(
        "No cloud embedding provider configured. Set EMBEDDING_ENGINE (e.g. openai/jina/azure/cohere) or set LIGHTWEIGHT_MODE=false to use native embeddings."
      );
    }

    if (engineSelection === "native") {
      throw new Error(
        'Embedding engine "native" is disabled in LIGHTWEIGHT_MODE. Set LIGHTWEIGHT_MODE=false to enable local embeddings.'
      );
    }

    if (["ollama", "lmstudio"].includes(engineSelection)) {
      throw new Error(
        `Embedding engine "${engineSelection}" is disabled in LIGHTWEIGHT_MODE. Set LIGHTWEIGHT_MODE=false to enable local engines.`
      );
    }
  }

  switch (engineSelection) {
    case "openai":
      const { OpenAiEmbedder } = require("../EmbeddingEngines/openAi");
      return new OpenAiEmbedder();
    case "azure":
      const {
        AzureOpenAiEmbedder,
      } = require("../EmbeddingEngines/azureOpenAi");
      return new AzureOpenAiEmbedder();
    case "localai":
      const { LocalAiEmbedder } = require("../EmbeddingEngines/localAi");
      return new LocalAiEmbedder();
    case "ollama":
      try {
        const { OllamaEmbedder } = require("../EmbeddingEngines/ollama");
        return new OllamaEmbedder();
      } catch (error) {
        throw new Error(
          missingOptionalDependencyMessage({
            feature: "Ollama embedding engine",
            packageName: "ollama",
            extra: error?.message,
          })
        );
      }
    case "native":
      return new NativeEmbedder();
    case "lmstudio":
      const { LMStudioEmbedder } = require("../EmbeddingEngines/lmstudio");
      return new LMStudioEmbedder();
    case "cohere":
      const { CohereEmbedder } = require("../EmbeddingEngines/cohere");
      return new CohereEmbedder();
    case "voyageai":
      const { VoyageAiEmbedder } = require("../EmbeddingEngines/voyageAi");
      return new VoyageAiEmbedder();
    case "litellm":
      const { LiteLLMEmbedder } = require("../EmbeddingEngines/liteLLM");
      return new LiteLLMEmbedder();
    case "mistral":
      const { MistralEmbedder } = require("../EmbeddingEngines/mistral");
      return new MistralEmbedder();
    case "generic-openai":
      const {
        GenericOpenAiEmbedder,
      } = require("../EmbeddingEngines/genericOpenAi");
      return new GenericOpenAiEmbedder();
    case "gemini":
      const { GeminiEmbedder } = require("../EmbeddingEngines/gemini");
      return new GeminiEmbedder();
    case "baai":
      const { BAAIEmbedder } = require("../EmbeddingEngines/baai");
      return new BAAIEmbedder();
    case "jina":
      const { JinaEmbedder } = require("../EmbeddingEngines/jina");
      return new JinaEmbedder();
    case "qwen":
      const { QwenEmbedder } = require("../EmbeddingEngines/qwen");
      return new QwenEmbedder();
    case "zhipu-embedding":
      const { ZhipuEmbedder } = require("../EmbeddingEngines/zhipuEmbedding");
      return new ZhipuEmbedder();
    default:
      return new NativeEmbedder();
  }
}

/**
 * Returns the LLMProviderClass - this is a helper method to access static methods on a class
 * @param {{provider: string | null} | null} params - Initialize params for LLMs provider
 * @returns {BaseLLMProviderClass}
 */
function getLLMProviderClass({ provider = null } = {}) {
  if (isLightweightMode() && ["ollama", "lmstudio"].includes(provider)) {
    return null;
  }
  switch (provider) {
    case "openai":
      const { OpenAiLLM } = require("../AiProviders/openAi");
      return OpenAiLLM;
    case "azure":
      const { AzureOpenAiLLM } = require("../AiProviders/azureOpenAi");
      return AzureOpenAiLLM;
    case "anthropic":
      const { AnthropicLLM } = require("../AiProviders/anthropic");
      return AnthropicLLM;
    case "gemini":
      const { GeminiLLM } = require("../AiProviders/gemini");
      return GeminiLLM;
    case "lmstudio":
      const { LMStudioLLM } = require("../AiProviders/lmStudio");
      return LMStudioLLM;
    case "ollama":
      try {
        const { OllamaAILLM } = require("../AiProviders/ollama");
        return OllamaAILLM;
      } catch {
        return null;
      }
    case "openrouter":
      const { OpenRouterLLM } = require("../AiProviders/openRouter");
      return OpenRouterLLM;
    case "generic-openai":
      const { GenericOpenAiLLM } = require("../AiProviders/genericOpenAi");
      return GenericOpenAiLLM;
    case "aihubmix":
      const { AiHubMixLLM } = require("../AiProviders/aihubmix");
      return AiHubMixLLM;
    case "deepseek":
      const { DeepSeekLLM } = require("../AiProviders/deepseek");
      return DeepSeekLLM;
    case "moonshotai":
      const { MoonshotAiLLM } = require("../AiProviders/moonshotAi");
      return MoonshotAiLLM;
    case "zhipu":
      const { ZhipuAiLLM } = require("../AiProviders/zhipuAi");
      return ZhipuAiLLM;
    case "minimax":
      const { MiniMaxLLM } = require("../AiProviders/minimax");
      return MiniMaxLLM;
    case "siliconflow":
      const { SiliconFlowLLM } = require("../AiProviders/siliconflow");
      return SiliconFlowLLM;
    case "hireagent":
      const { HireAgentLLM } = require("../AiProviders/hireagent");
      return HireAgentLLM;
    default:
      return null;
  }
}

/**
 * Returns the defined model (if available) for the given provider.
 * @param {{provider: string | null} | null} params - Initialize params for LLMs provider
 * @returns {string | null}
 */
function getBaseLLMProviderModel({ provider = null } = {}) {
  if (isLightweightMode() && ["ollama", "lmstudio"].includes(provider)) {
    return null;
  }
  switch (provider) {
    case "openai":
      return process.env.OPEN_MODEL_PREF;
    case "azure":
      return process.env.OPEN_MODEL_PREF;
    case "anthropic":
      return process.env.ANTHROPIC_MODEL_PREF;
    case "gemini":
      return process.env.GEMINI_LLM_MODEL_PREF;
    case "lmstudio":
      return process.env.LMSTUDIO_MODEL_PREF;
    case "ollama":
      return process.env.OLLAMA_MODEL_PREF;
    case "openrouter":
      return process.env.OPENROUTER_MODEL_PREF;
    case "generic-openai":
      return process.env.GENERIC_OPEN_AI_MODEL_PREF;
    case "aihubmix":
      return process.env.AIHUBMIX_MODEL_PREF;
    case "deepseek":
      return process.env.DEEPSEEK_MODEL_PREF;
    case "moonshotai":
      return process.env.MOONSHOT_AI_MODEL_PREF;
    case "zhipu":
      return process.env.ZHIPU_AI_MODEL_PREF;
    case "minimax":
      return process.env.MINIMAX_MODEL_PREF;
    case "siliconflow":
      return process.env.SILICONFLOW_MODEL_PREF;
    case "hireagent":
      return process.env.HIREAGENT_MODEL_PREF;
    default:
      return null;
  }
}

// Some models have lower restrictions on chars that can be encoded in a single pass
// and by default we assume it can handle 1,000 chars, but some models use work with smaller
// chars so here we can override that value when embedding information.
function maximumChunkLength() {
  if (
    !!process.env.EMBEDDING_MODEL_MAX_CHUNK_LENGTH &&
    !isNaN(process.env.EMBEDDING_MODEL_MAX_CHUNK_LENGTH) &&
    Number(process.env.EMBEDDING_MODEL_MAX_CHUNK_LENGTH) > 1
  )
    return Number(process.env.EMBEDDING_MODEL_MAX_CHUNK_LENGTH);

  return 1_000;
}

function toChunks(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_v, i) =>
    arr.slice(i * size, i * size + size)
  );
}

module.exports = {
  getEmbeddingEngineSelection,
  maximumChunkLength,
  getVectorDbClass,
  getLLMProviderClass,
  getBaseLLMProviderModel,
  getLLMProvider,
  toChunks,
};
