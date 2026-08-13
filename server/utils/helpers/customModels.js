const { fetchOpenRouterModels } = require("../AiProviders/openRouter");
const { ElevenLabsTTS } = require("../TextToSpeech/elevenLabs");
const { parseLMStudioBasePath } = require("../AiProviders/lmStudio");
const { GeminiLLM } = require("../AiProviders/gemini");
const {
  parseOpenAiCompatibleBasePath,
} = require("../AiProviders/lib/parseBasePath");

const SUPPORT_CUSTOM_MODELS = [
  "openai",
  "anthropic",
  "ollama",
  "openrouter",
  "lmstudio",
  "elevenlabs-tts",
  "deepseek",
  "gemini",
  "moonshotai",
  "zhipu",
  "minimax",
  "siliconflow",
  "hireagent",
  "aihubmix",
  // Embedding Engines
  "native-embedder",
];

async function getCustomModels(provider = "", apiKey = null, basePath = null) {
  if (!SUPPORT_CUSTOM_MODELS.includes(provider))
    return { models: [], error: "Invalid provider for custom models" };

  switch (provider) {
    case "openai":
      return await openAiModels(apiKey);
    case "anthropic":
      return await anthropicModels(apiKey);
    case "ollama":
      return await ollamaAIModels(basePath, apiKey);
    case "openrouter":
      return await getOpenRouterModels();
    case "lmstudio":
      return await getLMStudioModels(basePath);
    case "elevenlabs-tts":
      return await getElevenLabsModels(apiKey);
    case "deepseek":
      return await getDeepSeekModels(apiKey);
    case "gemini":
      return await getGeminiModels(apiKey);
    case "moonshotai":
      return await getMoonshotAiModels(apiKey);
    case "zhipu":
      return await getZhipuAiModels(apiKey);
    case "minimax":
      return await getMiniMaxModels(apiKey);
    case "siliconflow":
      return await getSiliconFlowModels(apiKey);
    case "hireagent":
      return await getHireAgentModels(apiKey, basePath);
    case "aihubmix":
      return await getAiHubMixModels(apiKey, basePath);
    case "native-embedder":
      return await getNativeEmbedderModels();
    default:
      return { models: [], error: "Invalid provider for custom models" };
  }
}

async function openAiModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.OPEN_AI_KEY,
  });
  const allModels = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`OpenAI:listModels`, e.message);
      return [
        {
          name: "gpt-3.5-turbo",
          id: "gpt-3.5-turbo",
          object: "model",
          created: 1677610602,
          owned_by: "openai",
          organization: "OpenAi",
        },
        {
          name: "gpt-4o",
          id: "gpt-4o",
          object: "model",
          created: 1677610602,
          owned_by: "openai",
          organization: "OpenAi",
        },
        {
          name: "gpt-4",
          id: "gpt-4",
          object: "model",
          created: 1687882411,
          owned_by: "openai",
          organization: "OpenAi",
        },
        {
          name: "gpt-4-turbo",
          id: "gpt-4-turbo",
          object: "model",
          created: 1712361441,
          owned_by: "system",
          organization: "OpenAi",
        },
        {
          name: "gpt-4-32k",
          id: "gpt-4-32k",
          object: "model",
          created: 1687979321,
          owned_by: "openai",
          organization: "OpenAi",
        },
        {
          name: "gpt-3.5-turbo-16k",
          id: "gpt-3.5-turbo-16k",
          object: "model",
          created: 1683758102,
          owned_by: "openai-internal",
          organization: "OpenAi",
        },
      ];
    });

  const gpts = allModels
    .filter(
      (model) =>
        (model.id.includes("gpt") && !model.id.startsWith("ft:")) ||
        model.id.startsWith("o") // o1, o1-mini, o3, etc
    )
    .filter(
      (model) =>
        !model.id.includes("vision") &&
        !model.id.includes("instruct") &&
        !model.id.includes("audio") &&
        !model.id.includes("realtime") &&
        !model.id.includes("image") &&
        !model.id.includes("moderation") &&
        !model.id.includes("transcribe")
    )
    .map((model) => {
      return {
        ...model,
        name: model.id,
        organization: "OpenAi",
      };
    });

  const customModels = allModels
    .filter(
      (model) =>
        !model.owned_by.includes("openai") && model.owned_by !== "system"
    )
    .map((model) => {
      return {
        ...model,
        name: model.id,
        organization: "Your Fine-Tunes",
      };
    });

  // Api Key was successful so lets save it for future uses
  if ((gpts.length > 0 || customModels.length > 0) && !!apiKey)
    process.env.OPEN_AI_KEY = apiKey;
  return { models: [...gpts, ...customModels], error: null };
}

async function anthropicModels(_apiKey = null) {
  const apiKey =
    _apiKey === true
      ? process.env.ANTHROPIC_API_KEY
      : _apiKey || process.env.ANTHROPIC_API_KEY || null;
  const AnthropicAI = require("@anthropic-ai/sdk");
  const anthropic = new AnthropicAI({ apiKey });
  const models = await anthropic.models
    .list()
    .then((results) => results.data)
    .then((models) => {
      return models
        .filter((model) => model.type === "model")
        .map((model) => {
          return {
            id: model.id,
            name: model.display_name,
          };
        });
    })
    .catch((e) => {
      console.error(`Anthropic:listModels`, e.message);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
  return { models, error: null };
}

async function localAIModels(basePath = null, apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    baseURL: basePath || process.env.LOCAL_AI_BASE_PATH,
    apiKey: apiKey || process.env.LOCAL_AI_API_KEY || null,
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`LocalAI:listModels`, e.message);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.LOCAL_AI_API_KEY = apiKey;
  return { models, error: null };
}

async function getGroqAiModels(_apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const apiKey =
    _apiKey === true
      ? process.env.GROQ_API_KEY
      : _apiKey || process.env.GROQ_API_KEY || null;
  const openai = new OpenAIApi({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
  });
  const models = (
    await openai.models
      .list()
      .then((results) => results.data)
      .catch((e) => {
        console.error(`GroqAi:listModels`, e.message);
        return [];
      })
  ).filter(
    (model) => !model.id.includes("whisper") && !model.id.includes("tool-use")
  );

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.GROQ_API_KEY = apiKey;
  return { models, error: null };
}

async function getAiHubMixModels(_apiKey = null, basePath = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const apiKey =
    _apiKey === true
      ? process.env.AIHUBMIX_API_KEY
      : _apiKey || process.env.AIHUBMIX_API_KEY || null;

  const baseURL =
    basePath || process.env.AIHUBMIX_BASE_PATH || "https://aihubmix.com/v1";

  const openai = new OpenAIApi({
    baseURL: parseOpenAiCompatibleBasePath(baseURL),
    apiKey,
  });

  const models = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`AiHubMix:listModels`, e.message);
      return [];
    });

  const chatModels = models
    .filter((model) => typeof model?.id === "string" && model.id.length > 0)
    .filter(
      (model) =>
        !model.id.includes("embedding") &&
        !model.id.includes("image") &&
        !model.id.includes("moderation") &&
        !model.id.includes("whisper") &&
        !model.id.includes("transcribe") &&
        !model.id.includes("tts") &&
        !model.id.includes("audio")
    )
    .map((model) => ({
      ...model,
      name: model.id,
      organization: model?.owned_by || "AiHubMix",
    }));

  if (chatModels.length > 0 && !!apiKey) process.env.AIHUBMIX_API_KEY = apiKey;
  if (chatModels.length > 0 && !!basePath)
    process.env.AIHUBMIX_BASE_PATH = basePath;

  return { models: chatModels, error: null };
}

async function liteLLMModels(basePath = null, apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    baseURL: basePath || process.env.LITE_LLM_BASE_PATH,
    apiKey: apiKey || process.env.LITE_LLM_API_KEY || null,
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`LiteLLM:listModels`, e.message);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.LITE_LLM_API_KEY = apiKey;
  return { models, error: null };
}

async function getLMStudioModels(basePath = null) {
  try {
    const { OpenAI: OpenAIApi } = require("openai");
    const openai = new OpenAIApi({
      baseURL: parseLMStudioBasePath(
        basePath || process.env.LMSTUDIO_BASE_PATH
      ),
      apiKey: null,
    });
    const models = await openai.models
      .list()
      .then((results) => results.data)
      .catch((e) => {
        console.error(`LMStudio:listModels`, e.message);
        return [];
      });

    return { models, error: null };
  } catch (e) {
    console.error(`LMStudio:getLMStudioModels`, e.message);
    return { models: [], error: "Could not fetch LMStudio Models" };
  }
}

async function getKoboldCPPModels(basePath = null) {
  try {
    const { OpenAI: OpenAIApi } = require("openai");
    const openai = new OpenAIApi({
      baseURL: basePath || process.env.KOBOLD_CPP_BASE_PATH,
      apiKey: null,
    });
    const models = await openai.models
      .list()
      .then((results) => results.data)
      .catch((e) => {
        console.error(`KoboldCPP:listModels`, e.message);
        return [];
      });

    return { models, error: null };
  } catch (e) {
    console.error(`KoboldCPP:getKoboldCPPModels`, e.message);
    return { models: [], error: "Could not fetch KoboldCPP Models" };
  }
}

async function ollamaAIModels(basePath = null, _authToken = null) {
  let url;
  try {
    let urlPath = basePath ?? process.env.OLLAMA_BASE_PATH;
    new URL(urlPath);
    if (urlPath.split("").slice(-1)?.[0] === "/")
      throw new Error("BasePath Cannot end in /!");
    url = urlPath;
  } catch {
    return { models: [], error: "Not a valid URL." };
  }

  const authToken = _authToken || process.env.OLLAMA_AUTH_TOKEN || null;
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const models = await fetch(`${url}/api/tags`, { headers: headers })
    .then((res) => {
      if (!res.ok)
        throw new Error(`Could not reach Ollama server! ${res.status}`);
      return res.json();
    })
    .then((data) => data?.models || [])
    .then((models) =>
      models.map((model) => {
        return { id: model.name };
      })
    )
    .catch((e) => {
      console.error(e);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!authToken)
    process.env.OLLAMA_AUTH_TOKEN = authToken;
  return { models, error: null };
}

async function getTogetherAiModels(apiKey = null) {
  const _apiKey =
    apiKey === true
      ? process.env.TOGETHER_AI_API_KEY
      : apiKey || process.env.TOGETHER_AI_API_KEY || null;
  try {
    const { togetherAiModels } = require("../AiProviders/togetherAi");
    const models = await togetherAiModels(_apiKey);
    if (models.length > 0 && !!_apiKey)
      process.env.TOGETHER_AI_API_KEY = _apiKey;
    return { models, error: null };
  } catch (error) {
    console.error("Error in getTogetherAiModels:", error);
    return { models: [], error: "Failed to fetch Together AI models" };
  }
}

async function getFireworksAiModels(apiKey = null) {
  const knownModels = await fireworksAiModels(apiKey);
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };

  const models = Object.values(knownModels).map((model) => {
    return {
      id: model.id,
      organization: model.organization,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getPerplexityModels() {
  const knownModels = perplexityModels();
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };

  const models = Object.values(knownModels).map((model) => {
    return {
      id: model.id,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getOpenRouterModels() {
  const knownModels = await fetchOpenRouterModels();
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };

  const models = Object.values(knownModels).map((model) => {
    return {
      id: model.id,
      organization: model.organization,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getNovitaModels() {
  const knownModels = await fetchNovitaModels();
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };
  const models = Object.values(knownModels).map((model) => {
    return {
      id: model.id,
      organization: model.organization,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getCometApiModels() {
  const knownModels = await fetchCometApiModels();
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };
  const models = Object.values(knownModels).map((model) => {
    return {
      id: model.id,
      organization: model.organization,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getAPIPieModels(apiKey = null) {
  const knownModels = await fetchApiPieModels(apiKey);
  if (!Object.keys(knownModels).length === 0)
    return { models: [], error: null };

  const models = Object.values(knownModels)
    .filter((model) => {
      // Filter for chat models
      return (
        model.subtype &&
        (model.subtype.includes("chat") || model.subtype.includes("chatx"))
      );
    })
    .map((model) => {
      return {
        id: model.id,
        organization: model.organization,
        name: model.name,
      };
    });
  return { models, error: null };
}

async function getMistralModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.MISTRAL_API_KEY || null,
    baseURL: "https://api.mistral.ai/v1",
  });
  const models = await openai.models
    .list()
    .then((results) =>
      results.data.filter((model) => !model.id.includes("embed"))
    )
    .catch((e) => {
      console.error(`Mistral:listModels`, e.message);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.MISTRAL_API_KEY = apiKey;
  return { models, error: null };
}

async function getElevenLabsModels(apiKey = null) {
  const models = (await ElevenLabsTTS.voices(apiKey)).map((model) => {
    return {
      id: model.voice_id,
      organization: model.category,
      name: model.name,
    };
  });

  if (models.length === 0) {
    return {
      models: [
        {
          id: "21m00Tcm4TlvDq8ikWAM",
          organization: "premade",
          name: "Rachel (default)",
        },
      ],
      error: null,
    };
  }

  if (models.length > 0 && !!apiKey) process.env.TTS_ELEVEN_LABS_KEY = apiKey;
  return { models, error: null };
}

async function getDeepSeekModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.id,
        organization: model.owned_by,
      }))
    )
    .catch((e) => {
      console.error(`DeepSeek:listModels`, e.message);
      return [
        {
          id: "deepseek-chat",
          name: "deepseek-chat",
          organization: "deepseek",
        },
        {
          id: "deepseek-reasoner",
          name: "deepseek-reasoner",
          organization: "deepseek",
        },
      ];
    });

  if (models.length > 0 && !!apiKey) process.env.DEEPSEEK_API_KEY = apiKey;
  return { models, error: null };
}

async function getXAIModels(_apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const apiKey =
    _apiKey === true
      ? process.env.XAI_LLM_API_KEY
      : _apiKey || process.env.XAI_LLM_API_KEY || null;
  const openai = new OpenAIApi({
    baseURL: "https://api.x.ai/v1",
    apiKey,
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`XAI:listModels`, e.message);
      return [
        {
          created: 1725148800,
          id: "grok-beta",
          object: "model",
          owned_by: "xai",
        },
      ];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.XAI_LLM_API_KEY = apiKey;
  return { models, error: null };
}

async function getNvidiaNimModels(basePath = null) {
  try {
    const { OpenAI: OpenAIApi } = require("openai");
    const openai = new OpenAIApi({
      baseURL: parseNvidiaNimBasePath(
        basePath ?? process.env.NVIDIA_NIM_LLM_BASE_PATH
      ),
      apiKey: null,
    });
    const modelResponse = await openai.models
      .list()
      .then((results) => results.data)
      .catch((e) => {
        throw new Error(e.message);
      });

    const models = modelResponse.map((model) => {
      return {
        id: model.id,
        name: model.id,
        organization: model.owned_by,
      };
    });

    return { models, error: null };
  } catch (e) {
    console.error(`NVIDIA NIM:getNvidiaNimModels`, e.message);
    return { models: [], error: "Could not fetch NVIDIA NIM Models" };
  }
}

async function getGeminiModels(_apiKey = null) {
  const apiKey =
    _apiKey === true
      ? process.env.GEMINI_API_KEY
      : _apiKey || process.env.GEMINI_API_KEY || null;
  const models = await GeminiLLM.fetchModels(apiKey);
  // Api Key was successful so lets save it for future uses
  if (models.length > 0 && !!apiKey) process.env.GEMINI_API_KEY = apiKey;
  return { models, error: null };
}

async function getPPIOModels() {
  const ppioModels = await fetchPPIOModels();
  if (!Object.keys(ppioModels).length === 0) return { models: [], error: null };
  const models = Object.values(ppioModels).map((model) => {
    return {
      id: model.id,
      organization: model.organization,
      name: model.name,
    };
  });
  return { models, error: null };
}

async function getDellProAiStudioModels(basePath = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  try {
    const { origin } = new URL(
      basePath || process.env.DELL_PRO_AI_STUDIO_BASE_PATH
    );
    const openai = new OpenAIApi({
      baseURL: `${origin}/v1/openai`,
      apiKey: null,
    });
    const models = await openai.models
      .list()
      .then((results) => results.data)
      .then((models) => {
        return models
          .filter((model) => model.capability === "TextToText") // Only include text-to-text models for this handler
          .map((model) => {
            return {
              id: model.id,
              name: model.name,
              organization: model.owned_by,
            };
          });
      })
      .catch((e) => {
        throw new Error(e.message);
      });
    return { models, error: null };
  } catch (e) {
    console.error(`getDellProAiStudioModels`, e.message);
    return {
      models: [],
      error: "Could not reach Dell Pro Ai Studio from the provided base path",
    };
  }
}

function getNativeEmbedderModels() {
  const { NativeEmbedder } = require("../EmbeddingEngines/native");
  return { models: NativeEmbedder.availableModels(), error: null };
}

async function getMoonshotAiModels(_apiKey = null) {
  const apiKey =
    _apiKey === true
      ? process.env.MOONSHOT_AI_API_KEY
      : _apiKey || process.env.MOONSHOT_AI_API_KEY || null;

  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    baseURL: "https://api.moonshot.ai/v1",
    apiKey,
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .catch((e) => {
      console.error(`MoonshotAi:listModels`, e.message);
      return [];
    });

  // Api Key was successful so lets save it for future uses
  if (models.length > 0) process.env.MOONSHOT_AI_API_KEY = apiKey;
  return { models, error: null };
}

async function getFoundryModels(basePath = null) {
  try {
    const { OpenAI: OpenAIApi } = require("openai");
    const openai = new OpenAIApi({
      baseURL: parseFoundryBasePath(basePath || process.env.FOUNDRY_BASE_PATH),
      apiKey: null,
    });
    const models = await openai.models
      .list()
      .then((results) =>
        results.data.map((model) => ({
          ...model,
          name: model.id,
        }))
      )
      .catch((e) => {
        console.error(`Foundry:listModels`, e.message);
        return [];
      });

    return { models, error: null };
  } catch (e) {
    console.error(`Foundry:getFoundryModels`, e.message);
    return { models: [], error: "Could not fetch Foundry Models" };
  }
}

/**
 * Get Cohere models
 * @param {string} _apiKey - The API key to use
 * @param {'chat' | 'embed'} type - The type of model to get
 * @returns {Promise<{models: Array<{id: string, organization: string, name: string}>, error: string | null}>}
 */
async function getCohereModels(_apiKey = null, type = "chat") {
  const apiKey =
    _apiKey === true
      ? process.env.COHERE_API_KEY
      : _apiKey || process.env.COHERE_API_KEY || null;

  const { CohereClient } = require("cohere-ai");
  const cohere = new CohereClient({
    token: apiKey,
  });
  const models = await cohere.models
    .list({ pageSize: 1000, endpoint: type })
    .then((results) => results.models)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.name,
      }))
    )
    .catch((e) => {
      console.error(`Cohere:listModels`, e.message);
      return [];
    });

  return { models, error: null };
}

/**
 * Get Zhipu AI models
 */
async function getZhipuAiModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.ZHIPU_AI_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.id,
        organization: "zhipu",
      }))
    )
    .catch((e) => {
      console.error(`ZhipuAI:listModels`, e.message);
      return [
        { id: "glm-4-plus", name: "glm-4-plus", organization: "zhipu" },
        { id: "glm-4-air", name: "glm-4-air", organization: "zhipu" },
        { id: "glm-4", name: "glm-4", organization: "zhipu" },
      ];
    });

  if (models.length > 0 && !!apiKey) process.env.ZHIPU_AI_API_KEY = apiKey;
  return { models, error: null };
}

/**
 * Get MiniMax models
 */
async function getMiniMaxModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.MINIMAX_API_KEY,
    baseURL: "https://api.minimax.chat/v1",
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.id,
        organization: "minimax",
      }))
    )
    .catch((e) => {
      console.error(`MiniMax:listModels`, e.message);
      return [
        { id: "abab6.5-chat", name: "abab6.5-chat", organization: "minimax" },
        { id: "abab5.5-chat", name: "abab5.5-chat", organization: "minimax" },
      ];
    });

  if (models.length > 0 && !!apiKey) process.env.MINIMAX_API_KEY = apiKey;
  return { models, error: null };
}

/**
 * Get SiliconFlow models
 */
async function getSiliconFlowModels(apiKey = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.SILICONFLOW_API_KEY,
    baseURL: "https://api.siliconflow.cn/v1",
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.id,
        organization: "siliconflow",
      }))
    )
    .catch((e) => {
      console.error(`SiliconFlow:listModels`, e.message);
      return [
        {
          id: "Qwen/Qwen2.5-7B-Instruct",
          name: "Qwen/Qwen2.5-7B-Instruct",
          organization: "siliconflow",
        },
        {
          id: "deepseek-ai/DeepSeek-V2.5",
          name: "deepseek-ai/DeepSeek-V2.5",
          organization: "siliconflow",
        },
      ];
    });

  if (models.length > 0 && !!apiKey) process.env.SILICONFLOW_API_KEY = apiKey;
  return { models, error: null };
}

/**
 * Get Octopus Studio models
 */
async function getHireAgentModels(apiKey = null, basePath = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const openai = new OpenAIApi({
    apiKey: apiKey || process.env.HIREAGENT_API_KEY,
    baseURL: parseOpenAiCompatibleBasePath(
      basePath || process.env.HIREAGENT_BASE_PATH
    ),
  });
  const models = await openai.models
    .list()
    .then((results) => results.data)
    .then((models) =>
      models.map((model) => ({
        id: model.id,
        name: model.id,
        organization: model.owned_by || "hireagent",
      }))
    )
    .catch((e) => {
      console.error(`HireAgent:listModels`, e.message);
      return [
        // OpenAI 系列
        { id: "gpt-4o", name: "GPT-4o", organization: "openai" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", organization: "openai" },
        { id: "gpt-4-turbo", name: "GPT-4 Turbo", organization: "openai" },
        { id: "gpt-4", name: "GPT-4", organization: "openai" },
        { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", organization: "openai" },

        // Anthropic Claude 系列
        {
          id: "claude-3-5-sonnet-20241022",
          name: "Claude 3.5 Sonnet",
          organization: "anthropic",
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          organization: "anthropic",
        },
        {
          id: "claude-3-opus-20240229",
          name: "Claude 3 Opus",
          organization: "anthropic",
        },

        // Google Gemini 系列
        {
          id: "gemini-2.0-flash-exp",
          name: "Gemini 2.0 Flash",
          organization: "google",
        },
        {
          id: "gemini-1.5-pro",
          name: "Gemini 1.5 Pro",
          organization: "google",
        },
        {
          id: "gemini-1.5-flash",
          name: "Gemini 1.5 Flash",
          organization: "google",
        },

        // DeepSeek 系列
        {
          id: "deepseek-chat",
          name: "DeepSeek Chat",
          organization: "deepseek",
        },
        {
          id: "deepseek-reasoner",
          name: "DeepSeek Reasoner",
          organization: "deepseek",
        },

        // 国产大模型
        {
          id: "moonshot-v1-8k",
          name: "Moonshot v1 8K",
          organization: "moonshot",
        },
        {
          id: "moonshot-v1-32k",
          name: "Moonshot v1 32K",
          organization: "moonshot",
        },
        {
          id: "moonshot-v1-128k",
          name: "Moonshot v1 128K",
          organization: "moonshot",
        },
        { id: "glm-4-plus", name: "GLM-4 Plus", organization: "zhipu" },
        { id: "glm-4-air", name: "GLM-4 Air", organization: "zhipu" },
        {
          id: "abab6.5s-chat",
          name: "MiniMax abab6.5s",
          organization: "minimax",
        },
        {
          id: "abab6.5g-chat",
          name: "MiniMax abab6.5g",
          organization: "minimax",
        },
      ];
    });

  if (models.length > 0 && !!apiKey) process.env.HIREAGENT_API_KEY = apiKey;
  if (models.length > 0 && !!basePath)
    process.env.HIREAGENT_BASE_PATH = basePath;
  return { models, error: null };
}

module.exports = {
  getCustomModels,
  SUPPORT_CUSTOM_MODELS,
};
