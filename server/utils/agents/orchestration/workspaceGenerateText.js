"use strict";

const { getLLMProvider } = require("../../helpers");

/**
 * Build a generateText function wired to the workspace's configured LLM provider.
 * Signature matches the orchestration planner's injectable generateText boundary:
 *   async ({ system, prompt, jsonMode? }) => Promise<string>
 *
 * Provider resolution order:
 *   1. workspace.agentProvider / workspace.agentModel  (agent-specific override)
 *   2. workspace.chatProvider  / workspace.chatModel   (general workspace fallback)
 *   3. System default via getLLMProvider (process.env.LLM_PROVIDER)
 *
 * The text field returned by getChatCompletion is `textResponse` — confirmed from
 * ChatCompletionResponse typedef in server/utils/helpers/index.js and all provider
 * implementations (e.g. openAi/index.js getChatCompletion returns { textResponse }).
 *
 * @param {Object} options
 * @param {Object} options.workspace - AnythingLLM workspace object
 * @returns {Function} async ({ system?, prompt, jsonMode? }) => Promise<string>
 */
function buildWorkspaceGenerateText({ workspace }) {
  return async function workspaceGenerateText({ system, prompt, jsonMode }) {
    const provider = getLLMProvider({
      provider: workspace.agentProvider || workspace.chatProvider || null,
      model: workspace.agentModel || workspace.chatModel || null,
    });

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    // Best-effort JSON mode: pass response_format only when caller opts in.
    // Providers that do not support this key will silently ignore it.
    // The non-jsonMode options object is byte-identical to the original.
    const completionOptions = jsonMode === true
      ? { temperature: 0, response_format: { type: "json_object" } }
      : { temperature: 0 };

    const resp = await provider.getChatCompletion(messages, completionOptions);
    return resp.textResponse ?? "";
  };
}

module.exports = { buildWorkspaceGenerateText };
