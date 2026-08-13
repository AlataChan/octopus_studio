import { useTranslation } from "react-i18next";

export const EFFECTIVE_AGENT_SOURCES = {
  EXPLICIT: "explicit",
  INHERIT_CHAT: "inheritChat",
  PROVIDER_DEFAULT: "providerDefault",
  SYSTEM_DEFAULT: "systemDefault",
};

/**
 * Mirrors the server agent model resolution (server/utils/agents/index.js #fetchModel)
 * so the UI can honestly show which model an agent will actually use.
 * Stored "none" agentProvider is treated as "not set".
 */
export function describeEffectiveAgentModel({
  workspace = {},
  systemSettings = {},
}) {
  const rawProvider = workspace.agentProvider ?? null;
  const hasAgentProvider = !!rawProvider && rawProvider !== "none";
  const agentModel = workspace.agentModel || null;

  // Provider not explicitly set -> server fallback logic
  if (!hasAgentProvider) {
    if (workspace.chatProvider && workspace.chatModel) {
      return {
        source: EFFECTIVE_AGENT_SOURCES.INHERIT_CHAT,
        provider: workspace.chatProvider,
        model: workspace.chatModel,
      };
    }
    return {
      source: EFFECTIVE_AGENT_SOURCES.SYSTEM_DEFAULT,
      provider: systemSettings.LLMProvider ?? null,
      model: systemSettings.LLMModel ?? null,
    };
  }

  // Provider explicitly set + explicit agent model
  if (agentModel) {
    return {
      source: EFFECTIVE_AGENT_SOURCES.EXPLICIT,
      provider: rawProvider,
      model: agentModel,
    };
  }

  // Provider explicitly set but no agent model -> that provider's server-side default.
  // Frontend cannot know the exact ENV default, so model is null (source carries the meaning).
  return {
    source: EFFECTIVE_AGENT_SOURCES.PROVIDER_DEFAULT,
    provider: rawProvider,
    model: null,
  };
}

export function EffectiveAgentModelHint({ workspace, settings }) {
  const { t } = useTranslation();
  const { source, model } = describeEffectiveAgentModel({
    workspace,
    systemSettings: settings ?? {},
  });

  let text = null;
  if (source === EFFECTIVE_AGENT_SOURCES.INHERIT_CHAT && model) {
    text = t("agent.effective.inherit_chat", { model });
  } else if (source === EFFECTIVE_AGENT_SOURCES.PROVIDER_DEFAULT) {
    text = t("agent.effective.provider_default");
  } else if (source === EFFECTIVE_AGENT_SOURCES.SYSTEM_DEFAULT && model) {
    text = t("agent.effective.system_default", { model });
  }
  if (!text) return null;

  return (
    <p className="text-theme-text-primary text-opacity-60 text-xs font-medium py-1.5">
      {text}
    </p>
  );
}
