/**
 * Eagerly load the context windows for the current provider.
 * This is done to ensure that the context windows are pre-cached when the server boots.
 *
 * This prevents us from having misreporting of the context window before a chat is ever sent.
 * eg: when viewing the attachments in the workspace - the context window would be misreported if a chat
 * has not been sent yet.
 */
const { isLightweightMode } = require("../helpers/lightweightMode");

async function eagerLoadContextWindows() {
  // Lite mode disables local model runners (Ollama/LMStudio), so we skip this step.
  if (isLightweightMode()) return;

  const currentProvider = process.env.LLM_PROVIDER;

  const log = (provider) => {
    console.log(`⚡\x1b[32mPre-cached context windows for ${provider}\x1b[0m`);
  };

  switch (currentProvider) {
    case "lmstudio":
      try {
        const { LMStudioLLM } = require("../AiProviders/lmStudio");
        await LMStudioLLM.cacheContextWindows(true);
        log("LMStudio");
      } catch (error) {
        console.warn(
          "[boot] Skipping LMStudio context window cache:",
          error?.message || error
        );
      }
      break;
    case "ollama":
      try {
        const { OllamaAILLM } = require("../AiProviders/ollama");
        await OllamaAILLM.cacheContextWindows(true);
        log("Ollama");
      } catch (error) {
        console.warn(
          "[boot] Skipping Ollama context window cache:",
          error?.message || error
        );
      }
      break;
  }
}

module.exports = eagerLoadContextWindows;
