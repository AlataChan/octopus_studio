import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
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
import OctopusStudioIcon from "@/media/logo/octopus-studio-icon-orange.png";

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
import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// 新增提供商暂时使用项目 Logo
const ZhipuAiLogo = OctopusStudioIcon;
const MiniMaxLogo = OctopusStudioIcon;
const SiliconFlowLogo = OctopusStudioIcon;
const HireAgentLogo = OctopusStudioIcon;
const AiHubMixLogo = OctopusStudioIcon;

const LLMS = [
  // 自有聚合服务（优先推荐）
  {
    name: "Octopus Studio",
    value: "hireagent",
    logo: HireAgentLogo,
    options: (settings) => <HireAgentOptions settings={settings} />,
    description: "自有聚合 LLM 服务，OpenAI 兼容",
  },

  // 国际主流提供商
  {
    name: "OpenAI",
    value: "openai",
    logo: OpenAiLogo,
    options: (settings) => <OpenAiOptions settings={settings} />,
    description: "The standard option for most non-commercial use.",
  },
  {
    name: "Azure OpenAI",
    value: "azure",
    logo: AzureOpenAiLogo,
    options: (settings) => <AzureAiOptions settings={settings} />,
    description: "The enterprise option of OpenAI hosted on Azure services.",
  },
  {
    name: "Anthropic",
    value: "anthropic",
    logo: AnthropicLogo,
    options: (settings) => <AnthropicAiOptions settings={settings} />,
    description: "A friendly AI Assistant hosted by Anthropic.",
  },
  {
    name: "Gemini",
    value: "gemini",
    logo: GeminiLogo,
    options: (settings) => <GeminiLLMOptions settings={settings} />,
    description: "Google's largest and most capable AI model",
  },
  {
    name: "OpenRouter",
    value: "openrouter",
    logo: OpenRouterLogo,
    options: (settings) => <OpenRouterOptions settings={settings} />,
    description: "A unified interface for LLMs.",
  },

  // 本地部署方案
  {
    name: "Ollama",
    value: "ollama",
    logo: OllamaLogo,
    options: (settings) => <OllamaLLMOptions settings={settings} />,
    description: "Run LLMs locally on your own machine.",
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    logo: LMStudioLogo,
    options: (settings) => <LMStudioOptions settings={settings} />,
    description:
      "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
  },

  // 中国本土提供商
  {
    name: "DeepSeek",
    value: "deepseek",
    logo: DeepSeekLogo,
    options: (settings) => <DeepSeekOptions settings={settings} />,
    description: "Run DeepSeek's powerful LLMs.",
  },
  {
    name: "Moonshot AI",
    value: "moonshotai",
    logo: MoonshotAiLogo,
    options: (settings) => <MoonshotAiOptions settings={settings} />,
    description: "Run Moonshot AI's powerful LLMs.",
  },
  {
    name: "智谱AI (Zhipu GLM)",
    value: "zhipu",
    logo: ZhipuAiLogo,
    options: (settings) => <ZhipuAiOptions settings={settings} />,
    description: "国产开源大模型代表，支持 GLM-4 系列",
  },
  {
    name: "MiniMax (海螺AI)",
    value: "minimax",
    logo: MiniMaxLogo,
    options: (settings) => <MiniMaxOptions settings={settings} />,
    description: "语音+文本多模态大模型",
  },
  {
    name: "硅基流动 (SiliconFlow)",
    value: "siliconflow",
    logo: SiliconFlowLogo,
    options: (settings) => <SiliconFlowOptions settings={settings} />,
    description: "开源模型推理平台，便宜高效",
  },

  // 灵活对接方案
  {
    name: "AiHubMix",
    value: "aihubmix",
    logo: AiHubMixLogo,
    options: (settings) => <AiHubMixOptions settings={settings} />,
    description: "OpenAI-compatible gateway (AiHubMix).",
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    logo: GenericOpenAiLogo,
    options: (settings) => <GenericOpenAiOptions settings={settings} />,
    description:
      "Connect to any OpenAi-compatible service via a custom configuration",
  },
];

export default function LLMPreference({
  setHeader,
  setForwardBtn,
  setBackBtn,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredLLMs, setFilteredLLMs] = useState([]);
  const [selectedLLM, setSelectedLLM] = useState(null);
  const [settings, setSettings] = useState(null);
  const formRef = useRef(null);
  const hiddenSubmitButtonRef = useRef(null);
  const isHosted = window.location.hostname.includes("useanything.com");
  const navigate = useNavigate();

  const TITLE = t("onboarding.llm.title");
  const DESCRIPTION = t("onboarding.llm.description");

  useEffect(() => {
    async function fetchKeys() {
      const _settings = await System.keys();
      setSettings(_settings);
      setSelectedLLM(_settings?.LLMProvider || "hireagent");
    }
    fetchKeys();
  }, []);

  function handleForward() {
    if (hiddenSubmitButtonRef.current) {
      hiddenSubmitButtonRef.current.click();
    }
  }

  function handleBack() {
    navigate(paths.onboarding.home());
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {};
    const formData = new FormData(form);
    data.LLMProvider = selectedLLM;
    // Default to Octopus Studio embedder and LanceDB
    data.EmbeddingEngine = "native";
    data.VectorDB = "lancedb";
    for (var [key, value] of formData.entries()) data[key] = value;

    const { error } = await System.updateSystem(data);
    if (error) {
      showToast(`Failed to save LLM settings: ${error}`, "error");
      return;
    }
    navigate(paths.onboarding.userSetup());
  };

  useEffect(() => {
    setHeader({ title: TITLE, description: DESCRIPTION });
    setForwardBtn({ showing: true, disabled: false, onClick: handleForward });
    setBackBtn({ showing: true, disabled: false, onClick: handleBack });
  }, []);

  useEffect(() => {
    const filtered = LLMS.filter((llm) =>
      llm.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLLMs(filtered);
  }, [searchQuery, selectedLLM]);

  return (
    <div>
      <form ref={formRef} onSubmit={handleSubmit} className="w-full">
        <div className="w-full relative border-theme-chat-input-border shadow border-2 rounded-lg text-theme-text-primary">
          <div className="w-full p-4 absolute top-0 rounded-t-lg backdrop-blur-sm">
            <div className="w-full flex items-center sticky top-0">
              <MagnifyingGlass
                size={16}
                weight="bold"
                className="absolute left-4 z-30 text-theme-text-primary"
              />
              <input
                type="text"
                placeholder="Search LLM providers"
                className="bg-theme-bg-secondary placeholder:text-theme-text-secondary z-20 pl-10 h-[38px] rounded-full w-full px-4 py-1 text-sm border border-theme-chat-input-border outline-none focus:outline-primary-button active:outline-primary-button outline-none text-theme-text-primary"
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
          </div>
          <div className="px-4 pt-[70px] flex flex-col gap-y-1 max-h-[390px] overflow-y-auto no-scroll pb-4">
            {filteredLLMs.map((llm) => {
              if (llm.value === "native" && isHosted) return null;
              return (
                <LLMItem
                  key={llm.name}
                  name={llm.name}
                  value={llm.value}
                  image={llm.logo}
                  description={llm.description}
                  checked={selectedLLM === llm.value}
                  onClick={() => setSelectedLLM(llm.value)}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-y-1">
          {selectedLLM &&
            LLMS.find((llm) => llm.value === selectedLLM)?.options(settings)}
        </div>
        <button
          type="submit"
          ref={hiddenSubmitButtonRef}
          hidden
          aria-hidden="true"
        ></button>
      </form>
    </div>
  );
}
