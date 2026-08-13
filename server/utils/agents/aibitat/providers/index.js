const OpenAIProvider = require("./openai.js");
const AnthropicProvider = require("./anthropic.js");
const AzureOpenAiProvider = require("./azure.js");
const OpenRouterProvider = require("./openrouter.js");
const GenericOpenAiProvider = require("./genericOpenAi.js");
const AiHubMixProvider = require("./aihubmix.js");
const DeepSeekProvider = require("./deepseek.js");
const GeminiProvider = require("./gemini.js");
const MoonshotAiProvider = require("./moonshotAi.js");
const { isLightweightMode } = require("../../../helpers/lightweightMode");

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

const LMStudioProvider = isLightweightMode()
  ? null
  : safeRequire("./lmstudio.js");
const OllamaProvider = isLightweightMode() ? null : safeRequire("./ollama.js");

const providers = {
  OpenAIProvider,
  AnthropicProvider,
  AzureOpenAiProvider,
  OpenRouterProvider,
  GenericOpenAiProvider,
  AiHubMixProvider,
  DeepSeekProvider,
  GeminiProvider,
  MoonshotAiProvider,
};

if (LMStudioProvider) providers.LMStudioProvider = LMStudioProvider;
if (OllamaProvider) providers.OllamaProvider = OllamaProvider;

module.exports = providers;
