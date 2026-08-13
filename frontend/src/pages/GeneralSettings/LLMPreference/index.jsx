import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import System from "@/models/system";
import showToast from "@/utils/toast";
import OctopusStudioIcon from "@/media/logo/octopus-studio-icon-orange.png";
import OpenAiLogo from "@/media/llmprovider/openai.png";
import GenericOpenAiLogo from "@/media/llmprovider/generic-openai.png";
import AzureOpenAiLogo from "@/media/llmprovider/azure.png";
import AnthropicLogo from "@/media/llmprovider/anthropic.png";
import GeminiLogo from "@/media/llmprovider/gemini.png";
import OllamaLogo from "@/media/llmprovider/ollama.png";
import LMStudioLogo from "@/media/llmprovider/lmstudio.png";
import OpenRouterLogo from "@/media/llmprovider/openrouter.jpeg";
import DeepSeekLogo from "@/media/llmprovider/deepseek.png";
import MoonshotAiLogo from "@/media/llmprovider/moonshotai.png";
// 新增提供商图标 (从 public 目录)
const ZhipuAiLogo = "/zhipu.png";
const MiniMaxLogo = "/minimax.png";
const SiliconFlowLogo = "/Siliconflow.png";
const HireAgentLogo = OctopusStudioIcon;
const AiHubMixLogo = GenericOpenAiLogo;

import PreLoader from "@/components/Preloader";
import OpenAiOptions from "@/components/LLMSelection/OpenAiOptions";
import GenericOpenAiOptions from "@/components/LLMSelection/GenericOpenAiOptions";
import AiHubMixOptions from "@/components/LLMSelection/AiHubMixOptions";
import AzureAiOptions from "@/components/LLMSelection/AzureAiOptions";
import AnthropicAiOptions from "@/components/LLMSelection/AnthropicAiOptions";
import LMStudioOptions from "@/components/LLMSelection/LMStudioOptions";
import GeminiLLMOptions from "@/components/LLMSelection/GeminiLLMOptions";
import OllamaLLMOptions from "@/components/LLMSelection/OllamaLLMOptions";
import OpenRouterOptions from "@/components/LLMSelection/OpenRouterOptions";
import DeepSeekOptions from "@/components/LLMSelection/DeepSeekOptions";
import MoonshotAiOptions from "@/components/LLMSelection/MoonshotAiOptions";
import ZhipuAiOptions from "@/components/LLMSelection/ZhipuAiOptions";
import MiniMaxOptions from "@/components/LLMSelection/MiniMaxOptions";
import SiliconFlowOptions from "@/components/LLMSelection/SiliconFlowOptions";
import HireAgentOptions from "@/components/LLMSelection/HireAgentOptions";

import LLMItem from "@/components/LLMSelection/LLMItem";
import LLMProviderOverrideNotice from "@/components/LLMSelection/LLMProviderOverrideNotice";
import { CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import CTAButton from "@/components/lib/CTAButton";
import useSystemSettings from "@/hooks/useSystemSettings";

export const AVAILABLE_LLM_PROVIDERS = [
  // 自有聚合服务（优先推荐）
  {
    name: "Octopus Studio",
    value: "hireagent",
    logo: HireAgentLogo,
    options: (settings) => <HireAgentOptions settings={settings} />,
    description: "自有聚合 LLM 服务，OpenAI 兼容",
    requiredConfig: ["HireAgentBasePath", "HireAgentApiKey"],
  },
  // 国际主流提供商
  {
    name: "OpenAI",
    value: "openai",
    logo: OpenAiLogo,
    options: (settings) => <OpenAiOptions settings={settings} />,
    description: "The standard option for most non-commercial use.",
    requiredConfig: ["OpenAiKey"],
  },
  {
    name: "Azure OpenAI",
    value: "azure",
    logo: AzureOpenAiLogo,
    options: (settings) => <AzureAiOptions settings={settings} />,
    description: "The enterprise option of OpenAI hosted on Azure services.",
    requiredConfig: ["AzureOpenAiEndpoint"],
  },
  {
    name: "Anthropic",
    value: "anthropic",
    logo: AnthropicLogo,
    options: (settings) => <AnthropicAiOptions settings={settings} />,
    description: "A friendly AI Assistant hosted by Anthropic.",
    requiredConfig: ["AnthropicApiKey"],
  },
  {
    name: "Gemini",
    value: "gemini",
    logo: GeminiLogo,
    options: (settings) => <GeminiLLMOptions settings={settings} />,
    description: "Google's largest and most capable AI model",
    requiredConfig: ["GeminiLLMApiKey"],
  },
  {
    name: "OpenRouter",
    value: "openrouter",
    logo: OpenRouterLogo,
    options: (settings) => <OpenRouterOptions settings={settings} />,
    description: "A unified interface for LLMs.",
    requiredConfig: ["OpenRouterApiKey"],
  },
  // 本地部署方案
  {
    name: "Ollama",
    value: "ollama",
    logo: OllamaLogo,
    options: (settings) => <OllamaLLMOptions settings={settings} />,
    description: "Run LLMs locally on your own machine.",
    requiredConfig: ["OllamaLLMBasePath"],
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    logo: LMStudioLogo,
    options: (settings) => <LMStudioOptions settings={settings} />,
    description:
      "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
    requiredConfig: ["LMStudioBasePath"],
  },
  // 中国本土提供商
  {
    name: "DeepSeek",
    value: "deepseek",
    logo: DeepSeekLogo,
    options: (settings) => <DeepSeekOptions settings={settings} />,
    description: "Run DeepSeek's powerful LLMs.",
    requiredConfig: ["DeepSeekApiKey"],
  },
  {
    name: "Moonshot AI",
    value: "moonshotai",
    logo: MoonshotAiLogo,
    options: (settings) => <MoonshotAiOptions settings={settings} />,
    description: "Run Moonshot AI's powerful LLMs.",
    requiredConfig: ["MoonshotAiApiKey"],
  },
  {
    name: "智谱AI (Zhipu GLM)",
    value: "zhipu",
    logo: ZhipuAiLogo,
    options: (settings) => <ZhipuAiOptions settings={settings} />,
    description: "国产开源大模型代表，支持 GLM-4、GLM-4-Plus 等模型",
    requiredConfig: ["ZhipuAiApiKey"],
  },
  {
    name: "MiniMax (海螺AI)",
    value: "minimax",
    logo: MiniMaxLogo,
    options: (settings) => <MiniMaxOptions settings={settings} />,
    description: "语音+文本多模态大模型，支持 abab6.5、abab5.5 等",
    requiredConfig: ["MiniMaxApiKey"],
  },
  {
    name: "硅基流动 (SiliconFlow)",
    value: "siliconflow",
    logo: SiliconFlowLogo,
    options: (settings) => <SiliconFlowOptions settings={settings} />,
    description: "开源模型推理平台，聚合 Qwen、DeepSeek、Llama 等模型",
    requiredConfig: ["SiliconFlowApiKey"],
  },
  // 灵活对接方案
  {
    name: "AiHubMix",
    value: "aihubmix",
    logo: AiHubMixLogo,
    options: (settings) => <AiHubMixOptions settings={settings} />,
    description: "OpenAI-compatible gateway (AiHubMix).",
    requiredConfig: [
      "AiHubMixBasePath",
      "AiHubMixModelPref",
      "AiHubMixTokenLimit",
      "AiHubMixApiKey",
    ],
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    logo: GenericOpenAiLogo,
    options: (settings) => <GenericOpenAiOptions settings={settings} />,
    description:
      "Connect to any OpenAi-compatible service via a custom configuration",
    requiredConfig: [
      "GenericOpenAiBasePath",
      "GenericOpenAiModelPref",
      "GenericOpenAiTokenLimit",
      "GenericOpenAiKey",
    ],
  },
];

export default function GeneralLLMPreference() {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { settings, loading } = useSystemSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredLLMs, setFilteredLLMs] = useState([]);
  const [selectedLLM, setSelectedLLM] = useState(null);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [providerOverrides, setProviderOverrides] = useState([]);
  const searchInputRef = useRef(null);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    // 如果 e 存在且有 preventDefault 方法,则调用它
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    // 获取表单元素
    const form = e?.target || document.getElementById("llm-form");
    if (!form) {
      showToast("无法找到表单元素", "error");
      return;
    }

    const data = { LLMProvider: selectedLLM };
    const formData = new FormData(form);

    for (var [key, value] of formData.entries()) data[key] = value;

    setSaving(true);
    const { error } = await System.updateSystem(data);

    if (error) {
      showToast(`Failed to save LLM settings: ${error}`, "error");
    } else {
      showToast("LLM preferences saved successfully.", "success");
    }
    setSaving(false);
    setHasChanges(!!error);
  };

  const updateLLMChoice = (selection) => {
    setSearchQuery("");
    setSelectedLLM(selection);
    setSearchMenuOpen(false);
    setHasChanges(true);
  };

  const handleXButton = () => {
    if (searchQuery.length > 0) {
      setSearchQuery("");
      if (searchInputRef.current) searchInputRef.current.value = "";
    } else {
      setSearchMenuOpen(!searchMenuOpen);
    }
  };

  useEffect(() => {
    if (!settings) return;
    setSelectedLLM((current) => current ?? settings?.LLMProvider);
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    async function fetchProviderOverrides() {
      try {
        const { overrides = [] } = await System.llmProviderOverrides();
        if (!mounted) return;
        setProviderOverrides(Array.isArray(overrides) ? overrides : []);
      } catch (_) {
        if (mounted) setProviderOverrides([]);
      }
    }

    fetchProviderOverrides();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const filtered = AVAILABLE_LLM_PROVIDERS.filter((llm) =>
      llm.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLLMs(filtered);
  }, [searchQuery, selectedLLM]);

  const selectedLLMObject = AVAILABLE_LLM_PROVIDERS.find(
    (llm) => llm.value === selectedLLM
  );
  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      {loading ? (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        </div>
      ) : (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <form id="llm-form" onSubmit={handleSubmit} className="flex w-full">
            <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
              <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <div className="flex gap-x-4 items-center">
                  <p className="text-lg leading-6 font-bold text-theme-text-primary">
                    {t("llm.title")}
                  </p>
                </div>
                <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
                  {t("llm.description")}
                </p>
                <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
                  {t("llm.system_default_notice")}
                </p>
              </div>
              <LLMProviderOverrideNotice overrides={providerOverrides} />
              <div className="w-full justify-end flex">
                {hasChanges && (
                  <CTAButton
                    onClick={() => handleSubmit()}
                    className="mt-3 mr-0 -mb-14 z-10"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </CTAButton>
                )}
              </div>
              <div className="text-base font-bold text-theme-text-primary mt-6 mb-4">
                {t("llm.provider")}
              </div>
              <div className="relative">
                {searchMenuOpen && (
                  <div
                    className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-70 backdrop-blur-sm z-10"
                    onClick={() => setSearchMenuOpen(false)}
                  />
                )}
                {searchMenuOpen ? (
                  <div className="absolute top-0 left-0 w-full max-w-[640px] max-h-[310px] min-h-[64px] bg-theme-settings-input-bg rounded-lg flex flex-col justify-between cursor-pointer border-2 border-primary-button z-20">
                    <div className="w-full flex flex-col gap-y-1">
                      <div className="flex items-center sticky top-0 z-10 border-b border-[#9CA3AF] mx-4 bg-theme-settings-input-bg">
                        <MagnifyingGlass
                          size={20}
                          weight="bold"
                          className="absolute left-4 z-30 text-theme-text-primary -ml-4 my-2"
                        />
                        <input
                          type="text"
                          name="llm-search"
                          autoComplete="off"
                          placeholder="Search all LLM providers"
                          className="border-none -ml-4 my-2 bg-transparent z-20 pl-12 h-[38px] w-full px-4 py-1 text-sm outline-none text-theme-text-primary placeholder:text-theme-text-primary placeholder:font-medium"
                          onChange={(e) => setSearchQuery(e.target.value)}
                          ref={searchInputRef}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                        />
                        <X
                          size={20}
                          weight="bold"
                          className="cursor-pointer text-theme-text-primary hover:text-x-button"
                          onClick={handleXButton}
                        />
                      </div>
                      <div className="flex-1 pl-4 pr-2 flex flex-col gap-y-1 overflow-y-auto white-scrollbar pb-4 max-h-[245px]">
                        {filteredLLMs.map((llm) => {
                          return (
                            <LLMItem
                              key={llm.name}
                              name={llm.name}
                              value={llm.value}
                              image={llm.logo}
                              description={llm.description}
                              checked={selectedLLM === llm.value}
                              onClick={() => updateLLMChoice(llm.value)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full max-w-[640px] h-[64px] bg-theme-settings-input-bg rounded-lg flex items-center p-[14px] justify-between cursor-pointer border-2 border-transparent hover:border-primary-button transition-all duration-300"
                    type="button"
                    onClick={() => setSearchMenuOpen(true)}
                  >
                    <div className="flex gap-x-4 items-center">
                      <img
                        src={selectedLLMObject?.logo || OctopusStudioIcon}
                        alt={`${selectedLLMObject?.name} logo`}
                        className="w-10 h-10 rounded-md"
                      />
                      <div className="flex flex-col text-left">
                        <div className="text-sm font-semibold text-theme-text-primary">
                          {selectedLLMObject?.name || "None selected"}
                        </div>
                        <div className="mt-1 text-xs text-description">
                          {selectedLLMObject?.description ||
                            "You need to select an LLM"}
                        </div>
                      </div>
                    </div>
                    <CaretUpDown
                      size={24}
                      weight="bold"
                      className="text-theme-text-primary"
                    />
                  </button>
                )}
              </div>
              <div
                onChange={() => setHasChanges(true)}
                className="mt-4 flex flex-col gap-y-1"
              >
                {selectedLLM &&
                  AVAILABLE_LLM_PROVIDERS.find(
                    (llm) => llm.value === selectedLLM
                  )?.options?.(settings)}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
