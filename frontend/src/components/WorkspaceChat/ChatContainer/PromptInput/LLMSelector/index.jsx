import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PreLoader from "@/components/Preloader";
import ChatModelSelection from "./ChatModelSelection";
import { useTranslation } from "react-i18next";
import { PROVIDER_SETUP_EVENT, SAVE_LLM_SELECTOR_EVENT } from "./action";
import {
  WORKSPACE_LLM_PROVIDERS,
  autoScrollToSelectedLLMProvider,
  hasMissingCredentials,
  validatedModelSelection,
} from "./utils";
import LLMSelectorSidePanel from "./LLMSelector";
import { NoSetupWarning } from "./SetupProvider";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import System from "@/models/system";
import {
  EFFECTIVE_AGENT_SOURCES,
  describeEffectiveAgentModel,
  EffectiveAgentModelHint,
} from "./effectiveAgentModel";

export { EFFECTIVE_AGENT_SOURCES, describeEffectiveAgentModel } from "./effectiveAgentModel";

export const LLM_SELECTOR_TARGETS = {
  CHAT: "chat",
  AGENT: "agent",
};

export function resolveLLMSelectorSelection({
  workspace = {},
  systemSettings = {},
  target = LLM_SELECTOR_TARGETS.CHAT,
}) {
  if (target === LLM_SELECTOR_TARGETS.AGENT) {
    return {
      provider:
        workspace.agentProvider ??
        workspace.chatProvider ??
        systemSettings.LLMProvider,
      model:
        workspace.agentModel ?? workspace.chatModel ?? systemSettings.LLMModel,
    };
  }

  return {
    provider: workspace.chatProvider ?? systemSettings.LLMProvider,
    model: workspace.chatModel ?? systemSettings.LLMModel,
  };
}

export function buildLLMSelectorWorkspaceUpdate({
  target = LLM_SELECTOR_TARGETS.CHAT,
  provider,
  model,
}) {
  if (target === LLM_SELECTOR_TARGETS.AGENT) {
    return {
      agentProvider: provider,
      agentModel: model,
    };
  }

  return {
    chatProvider: provider,
    chatModel: model,
  };
}

export default function LLMSelectorModal({
  target = LLM_SELECTOR_TARGETS.CHAT,
}) {
  const { slug } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState("");
  const [availableProviders, setAvailableProviders] = useState(
    WORKSPACE_LLM_PROVIDERS
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missingCredentials, setMissingCredentials] = useState(false);
  const modalSize = {
    height: "min(360px, calc(100vh - 290px))",
    minHeight: "260px",
  };

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([Workspace.bySlug(slug), System.keys()])
      .then(([workspace, systemSettings]) => {
        const { provider, model } = resolveLLMSelectorSelection({
          workspace,
          systemSettings,
          target,
        });

        setSettings(systemSettings);
        setWorkspace(workspace);
        setSelectedLLMProvider(provider);
        autoScrollToSelectedLLMProvider(provider);
        setSelectedLLMModel(model);
      })
      .finally(() => setLoading(false));
  }, [slug, target]);

  function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProviders = WORKSPACE_LLM_PROVIDERS.filter((provider) =>
      provider.name.toLowerCase().includes(searchTerm)
    );
    setAvailableProviders(filteredProviders);
  }

  function handleProviderSelection(provider) {
    setSelectedLLMProvider(provider);
    setAvailableProviders(WORKSPACE_LLM_PROVIDERS);
    autoScrollToSelectedLLMProvider(provider, 50);
    document.getElementById("llm-search-input").value = "";
    setHasChanges(true);
    setMissingCredentials(hasMissingCredentials(settings, provider));
  }

  async function handleSave() {
    setSaving(true);
    try {
      setHasChanges(false);
      const validatedModel = validatedModelSelection(selectedLLMModel);
      if (!validatedModel) throw new Error("Invalid model selection");

      const { message } = await Workspace.update(slug, {
        ...buildLLMSelectorWorkspaceUpdate({
          target,
          provider: selectedLLMProvider,
          model: validatedModel,
        }),
      });

      if (!!message) throw new Error(message);
      window.dispatchEvent(new Event(SAVE_LLM_SELECTOR_EVENT));
    } catch (error) {
      console.error(error);
      showToast(error.message, "error", { clear: true });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        id="llm-selector-modal"
        style={modalSize}
        className="w-full p-0 overflow-hidden flex flex-col items-center justify-center"
      >
        <PreLoader size={12} />
        <p className="text-theme-text-secondary text-sm mt-2">
          {t("chat_window.workspace_llm_manager.loading_workspace_settings")}
        </p>
      </div>
    );
  }

  const targetBadgeKey =
    target === LLM_SELECTOR_TARGETS.AGENT
      ? "chat_window.workspace_llm_manager.target_agent"
      : "chat_window.workspace_llm_manager.target_chat";

  return (
    <div
      id="llm-selector-modal"
      style={modalSize}
      className="w-full p-0 overflow-hidden flex flex-col"
    >
      <div className="px-2 pt-1 pb-1.5 text-xs font-semibold text-theme-text-secondary border-b border-theme-border-subtle">
        {t(targetBadgeKey)}
      </div>
      <div className="flex flex-1 min-h-0">
        <LLMSelectorSidePanel
          availableProviders={availableProviders}
          selectedLLMProvider={selectedLLMProvider}
          onSearchChange={handleSearch}
          onProviderClick={handleProviderSelection}
        />
        <div className="w-[60%] h-full min-h-0 overflow-y-auto px-2 flex flex-col gap-y-2">
          <NoSetupWarning
            showing={missingCredentials}
            onSetupClick={() => {
              window.dispatchEvent(
                new CustomEvent(PROVIDER_SETUP_EVENT, {
                  detail: {
                    provider: WORKSPACE_LLM_PROVIDERS.find(
                      (p) => p.value === selectedLLMProvider
                    ),
                    settings,
                  },
                })
              );
            }}
          />
          <ChatModelSelection
            provider={selectedLLMProvider}
            setHasChanges={setHasChanges}
            selectedLLMModel={selectedLLMModel}
            setSelectedLLMModel={setSelectedLLMModel}
          />
          {target === LLM_SELECTOR_TARGETS.AGENT && workspace && (
            <EffectiveAgentModelHint workspace={workspace} settings={settings} />
          )}
          {hasChanges && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className={`border-none text-xs px-4 py-1 font-semibold light:text-[#ffffff] rounded-lg bg-primary-button hover:bg-secondary hover:text-theme-text-primary h-[34px] whitespace-nowrap w-full`}
            >
              {saving
                ? t("chat_window.workspace_llm_manager.saving")
                : t("chat_window.workspace_llm_manager.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
