import React, { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import System from "@/models/system";
import showToast from "@/utils/toast";
import OctopusStudioIcon from "@/media/logo/octopus-studio-icon-orange.png";
import OpenAiLogo from "@/media/llmprovider/openai.png";
import AzureOpenAiLogo from "@/media/llmprovider/azure.png";
import GeminiAiLogo from "@/media/llmprovider/gemini.png";
import LocalAiLogo from "@/media/llmprovider/localai.png";
import OllamaLogo from "@/media/llmprovider/ollama.png";
import LMStudioLogo from "@/media/llmprovider/lmstudio.png";
import CohereLogo from "@/media/llmprovider/cohere.png";
import VoyageAiLogo from "@/media/embeddingprovider/voyageai.png";
import LiteLLMLogo from "@/media/llmprovider/litellm.png";
import GenericOpenAiLogo from "@/media/llmprovider/generic-openai.png";
import MistralAiLogo from "@/media/llmprovider/mistral.jpeg";
// 国内提供商图标 (从 public 目录)
const BAAILogo = "/BAAI.png";
const QwenLogo = "/qwen.png";
const ZhipuLogo = "/zhipu.png";
const JinaLogo = "/Jina - Light.svg";

import PreLoader from "@/components/Preloader";
import ChangeWarningModal from "@/components/ChangeWarning";
import OpenAiOptions from "@/components/EmbeddingSelection/OpenAiOptions";
import AzureAiOptions from "@/components/EmbeddingSelection/AzureAiOptions";
import GeminiOptions from "@/components/EmbeddingSelection/GeminiOptions";
import LocalAiOptions from "@/components/EmbeddingSelection/LocalAiOptions";
import NativeEmbeddingOptions from "@/components/EmbeddingSelection/NativeEmbeddingOptions";
import OllamaEmbeddingOptions from "@/components/EmbeddingSelection/OllamaOptions";
import LMStudioEmbeddingOptions from "@/components/EmbeddingSelection/LMStudioOptions";
import CohereEmbeddingOptions from "@/components/EmbeddingSelection/CohereOptions";
import VoyageAiOptions from "@/components/EmbeddingSelection/VoyageAiOptions";
import LiteLLMOptions from "@/components/EmbeddingSelection/LiteLLMOptions";
import GenericOpenAiEmbeddingOptions from "@/components/EmbeddingSelection/GenericOpenAiOptions";

import EmbedderItem from "@/components/EmbeddingSelection/EmbedderItem";
import { CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useModal } from "@/hooks/useModal";
import ModalWrapper from "@/components/ModalWrapper";
import CTAButton from "@/components/lib/CTAButton";
import { useTranslation } from "react-i18next";
import MistralAiOptions from "@/components/EmbeddingSelection/MistralAiOptions";
import TextSplitterSettings from "@/components/EmbeddingSelection/TextSplitterSettings";
import Admin from "@/models/admin";
import BAAIOptions from "@/components/EmbeddingSelection/BAAIOptions";
import JinaOptions from "@/components/EmbeddingSelection/JinaOptions";
import QwenOptions from "@/components/EmbeddingSelection/QwenOptions";
import ZhipuEmbeddingOptions from "@/components/EmbeddingSelection/ZhipuEmbeddingOptions";
import useSystemSettings from "@/hooks/useSystemSettings";

const EMBEDDERS = [
  // 优先推荐 - Octopus Studio
  {
    name: "Octopus Studio Embedder",
    value: "native",
    logo: OctopusStudioIcon,
    options: (settings) => <NativeEmbeddingOptions settings={settings} />,
    description:
      "Use the built-in embedding provider for Octopus Studio. Zero setup!",
    tags: ["本地部署", "多语言"],
  },
  // 国内提供商 (优先推荐)
  {
    name: "BAAI (智源)",
    value: "baai",
    logo: BAAILogo,
    options: (settings) => <BAAIOptions settings={settings} />,
    description: "中文最佳的 embedding 模型,支持本地部署和 API 调用",
    tags: ["本地部署", "API", "中文优化"],
  },
  {
    name: "Jina AI",
    value: "jina",
    logo: JinaLogo,
    options: (settings) => <JinaOptions settings={settings} />,
    description: "支持中英文的高质量 embedding 模型,可本地部署",
    tags: ["本地部署", "API", "多语言"],
  },
  {
    name: "Qwen (通义千问)",
    value: "qwen",
    logo: QwenLogo,
    options: (settings) => <QwenOptions settings={settings} />,
    description: "阿里云提供的中文 embedding 模型",
    tags: ["API", "中文优化"],
  },
  {
    name: "Zhipu AI (智谱)",
    value: "zhipu-embedding",
    logo: ZhipuLogo,
    options: (settings) => <ZhipuEmbeddingOptions settings={settings} />,
    description: "智谱 AI 提供的中文 embedding 模型",
    tags: ["API", "中文优化"],
  },
  // 国际主流提供商
  {
    name: "OpenAI",
    value: "openai",
    logo: OpenAiLogo,
    options: (settings) => <OpenAiOptions settings={settings} />,
    description: "The standard option for most non-commercial use.",
    tags: ["API", "多语言"],
  },
  {
    name: "Azure OpenAI",
    value: "azure",
    logo: AzureOpenAiLogo,
    options: (settings) => <AzureAiOptions settings={settings} />,
    description: "The enterprise option of OpenAI hosted on Azure services.",
    tags: ["API", "多语言"],
  },
  {
    name: "Gemini",
    value: "gemini",
    logo: GeminiAiLogo,
    options: (settings) => <GeminiOptions settings={settings} />,
    description: "Run powerful embedding models from Google AI.",
    tags: ["API", "多语言"],
  },
  // 本地部署选项
  {
    name: "Ollama",
    value: "ollama",
    logo: OllamaLogo,
    options: (settings) => <OllamaEmbeddingOptions settings={settings} />,
    description: "Run embedding models locally on your own machine.",
    tags: ["本地部署", "多语言"],
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    logo: LMStudioLogo,
    options: (settings) => <LMStudioEmbeddingOptions settings={settings} />,
    description:
      "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
    tags: ["本地部署", "多语言"],
  },
  {
    name: "Local AI",
    value: "localai",
    logo: LocalAiLogo,
    options: (settings) => <LocalAiOptions settings={settings} />,
    description: "Run embedding models locally on your own machine.",
    tags: ["本地部署", "多语言"],
  },
  // 其他提供商
  {
    name: "Cohere",
    value: "cohere",
    logo: CohereLogo,
    options: (settings) => <CohereEmbeddingOptions settings={settings} />,
    description: "Run powerful embedding models from Cohere.",
    tags: ["API", "多语言"],
  },
  {
    name: "Voyage AI",
    value: "voyageai",
    logo: VoyageAiLogo,
    options: (settings) => <VoyageAiOptions settings={settings} />,
    description: "Run powerful embedding models from Voyage AI.",
    tags: ["API", "多语言"],
  },
  {
    name: "LiteLLM",
    value: "litellm",
    logo: LiteLLMLogo,
    options: (settings) => <LiteLLMOptions settings={settings} />,
    description: "Run powerful embedding models from LiteLLM.",
    tags: ["API", "多语言"],
  },
  {
    name: "Mistral AI",
    value: "mistral",
    logo: MistralAiLogo,
    options: (settings) => <MistralAiOptions settings={settings} />,
    description: "Run powerful embedding models from Mistral AI.",
    tags: ["API", "多语言"],
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    logo: GenericOpenAiLogo,
    options: (settings) => (
      <GenericOpenAiEmbeddingOptions settings={settings} />
    ),
    description: "Run embedding models from any OpenAI compatible API service.",
    tags: ["API", "多语言"],
  },
];

const UNAVAILABLE_EMBEDDER = {
  name: "Unavailable embedding provider",
  value: "unavailable",
  logo: OctopusStudioIcon,
  options: () => null,
  description:
    "The saved embedding provider is no longer available. Choose a supported provider to continue.",
  tags: [],
};

export default function GeneralEmbeddingPreference() {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasEmbeddings, setHasEmbeddings] = useState(false);
  const [hasCachedEmbeddings, setHasCachedEmbeddings] = useState(false);
  const { settings, loading } = useSystemSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredEmbedders, setFilteredEmbedders] = useState([]);
  const [selectedEmbedder, setSelectedEmbedder] = useState(null);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
  const { isOpen, openModal, closeModal } = useModal();
  const { t } = useTranslation();

  // 测试连接状态
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }

  // 文本分割设置状态
  const [textSplitterSettings, setTextSplitterSettings] = useState({
    text_splitter_chunk_size: null,
    text_splitter_chunk_overlap: null,
  });

  // 标签筛选状态
  const [selectedTags, setSelectedTags] = useState([]);

  function embedderModelChanged(formEl) {
    try {
      const newModel = new FormData(formEl).get("EmbeddingModelPref") ?? null;
      if (newModel === null) return false;
      return settings?.EmbeddingModelPref !== newModel;
    } catch (error) {
      console.error(error);
    }
    return false;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      (selectedEmbedder !== settings?.EmbeddingEngine ||
        embedderModelChanged(e.target)) &&
      hasChanges &&
      (hasEmbeddings || hasCachedEmbeddings)
    ) {
      openModal();
    } else {
      await handleSaveSettings();
    }
  };

  /**
   * 测试 embedding 连接
   */
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const form = document.getElementById("embedding-form");
      const formData = new FormData(form);
      const testData = {
        EmbeddingEngine: selectedEmbedder,
      };

      // 收集表单数据
      for (var [key, value] of formData.entries()) {
        testData[key] = value;
      }

      // 调用测试 API
      const { success, message } =
        await System.testEmbeddingConnection(testData);

      setTestResult({
        success,
        message: message || (success ? "连接测试成功!" : "连接测试失败"),
      });

      if (success) {
        showToast("Embedding 连接测试成功!", "success");
      } else {
        showToast(`连接测试失败: ${message}`, "error");
      }
    } catch (error) {
      console.error("Test connection error:", error);
      setTestResult({
        success: false,
        message: error.message || "测试连接时发生错误",
      });
      showToast(`测试连接失败: ${error.message}`, "error");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    const form = document.getElementById("embedding-form");
    const settingsData = {};
    const formData = new FormData(form);
    settingsData.EmbeddingEngine = selectedEmbedder;
    for (var [key, value] of formData.entries()) settingsData[key] = value;

    // 合并文本分割设置
    if (textSplitterSettings.text_splitter_chunk_size !== null) {
      settingsData.text_splitter_chunk_size =
        textSplitterSettings.text_splitter_chunk_size;
    }
    if (textSplitterSettings.text_splitter_chunk_overlap !== null) {
      settingsData.text_splitter_chunk_overlap =
        textSplitterSettings.text_splitter_chunk_overlap;
    }

    // 保存嵌入器设置
    const { error } = await System.updateSystem(settingsData);
    if (error) {
      showToast(`Failed to save embedding settings: ${error}`, "error");
      setHasChanges(true);
      setSaving(false);
      closeModal();
      return;
    }

    // 保存文本分割设置
    try {
      await Admin.updateSystemPreferences({
        text_splitter_chunk_size: settingsData.text_splitter_chunk_size,
        text_splitter_chunk_overlap: settingsData.text_splitter_chunk_overlap,
      });
      showToast("嵌入和文本分割设置已成功保存", "success");
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save text splitting settings:", err);
      showToast("保存文本分割设置失败", "error");
      setHasChanges(true);
    }

    setSaving(false);
    closeModal();
  };

  const updateChoice = (selection) => {
    setSearchQuery("");
    setSelectedEmbedder(selection);
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
    setSelectedEmbedder(
      (current) => current ?? settings?.EmbeddingEngine ?? "native"
    );
    setHasEmbeddings(settings?.HasExistingEmbeddings || false);
    setHasCachedEmbeddings(settings?.HasCachedEmbeddings || false);
  }, [settings]);

  useEffect(() => {
    let filtered = EMBEDDERS.filter((embedder) =>
      embedder.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 如果有选中的标签,进一步筛选
    if (selectedTags.length > 0) {
      filtered = filtered.filter((embedder) =>
        selectedTags.every((tag) => embedder.tags?.includes(tag))
      );
    }

    setFilteredEmbedders(filtered);
  }, [searchQuery, selectedEmbedder, selectedTags]);

  const selectedEmbedderObject =
    EMBEDDERS.find((embedder) => embedder.value === selectedEmbedder) ??
    UNAVAILABLE_EMBEDDER;
  const selectedEmbedderAvailable = EMBEDDERS.some(
    (embedder) => embedder.value === selectedEmbedder
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
          <form
            id="embedding-form"
            onSubmit={handleSubmit}
            className="flex w-full"
          >
            <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] py-16 md:py-6">
              <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <div className="flex gap-x-4 items-center">
                  <p className="text-lg leading-6 font-bold text-theme-text-primary">
                    {t("embedding.title")}
                  </p>
                </div>
                <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
                  {t("embedding.desc-start")}
                  <br />
                  {t("embedding.desc-end")}
                </p>
              </div>
              <div className="w-full justify-end flex gap-x-2">
                {hasChanges && (
                  <>
                    <CTAButton
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="mt-3 mr-0 -mb-14 z-10 bg-zinc-600 hover:bg-zinc-700"
                    >
                      {testing ? "测试中..." : "测试连接"}
                    </CTAButton>
                    <CTAButton
                      type="submit"
                      disabled={testing}
                      className="mt-3 mr-0 -mb-14 z-10"
                    >
                      {saving ? t("common.saving") : t("common.save")}
                    </CTAButton>
                  </>
                )}
              </div>
              {testResult && (
                <div
                  className={`mt-4 p-3 rounded-lg ${
                    testResult.success
                      ? "bg-green-500/10 border border-green-500/50 text-green-400"
                      : "bg-red-500/10 border border-red-500/50 text-red-400"
                  }`}
                >
                  <p className="text-sm">{testResult.message}</p>
                </div>
              )}
              <div className="text-base font-bold text-theme-text-primary mt-6 mb-4">
                {t("embedding.provider.title")}
              </div>
              <div className="relative">
                {searchMenuOpen && (
                  <div
                    className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-70 backdrop-blur-sm z-10"
                    onClick={() => setSearchMenuOpen(false)}
                  />
                )}
                {searchMenuOpen ? (
                  <div className="absolute top-0 left-0 w-full max-w-[640px] max-h-[520px] min-h-[64px] bg-theme-settings-input-bg rounded-lg flex flex-col cursor-pointer border-2 border-primary-button z-20">
                    <div className="w-full flex flex-col h-full">
                      <div className="flex items-center sticky top-0 z-10 border-b border-[#9CA3AF] mx-4 bg-theme-settings-input-bg">
                        <MagnifyingGlass
                          size={20}
                          weight="bold"
                          className="absolute left-4 z-30 text-theme-text-primary -ml-4 my-2"
                        />
                        <input
                          type="text"
                          name="embedder-search"
                          autoComplete="off"
                          placeholder="搜索所有嵌入提供商"
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

                      {/* 标签筛选器 */}
                      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-theme-border bg-theme-bg-secondary/30">
                        <span className="text-xs text-white/40 flex items-center mr-1">
                          筛选:
                        </span>
                        {["本地部署", "API", "中文优化", "多语言"].map(
                          (tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setSelectedTags((prev) =>
                                  prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag]
                                );
                              }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                                selectedTags.includes(tag)
                                  ? "bg-primary-button text-theme-text-primary shadow-md scale-105"
                                  : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-theme-text-primary border border-theme-border hover:border-theme-border-medium"
                              }`}
                            >
                              {selectedTags.includes(tag) && "✓ "}
                              {tag}
                            </button>
                          )
                        )}
                        {selectedTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedTags([])}
                            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-theme-border hover:border-theme-border-medium transition-all duration-200"
                          >
                            ✕ 清除
                          </button>
                        )}
                      </div>

                      <div className="flex-1 pl-4 pr-2 flex flex-col gap-y-1 overflow-y-auto white-scrollbar pb-4 max-h-[360px]">
                        {filteredEmbedders.map((embedder) => (
                          <EmbedderItem
                            key={embedder.name}
                            name={embedder.name}
                            value={embedder.value}
                            image={embedder.logo}
                            description={embedder.description}
                            checked={selectedEmbedder === embedder.value}
                            onClick={() => updateChoice(embedder.value)}
                            tags={embedder.tags || []}
                          />
                        ))}
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
                        src={selectedEmbedderObject.logo}
                        alt={`${selectedEmbedderObject.name} logo`}
                        className="w-10 h-10 rounded-md"
                      />
                      <div className="flex flex-col text-left">
                        <div className="text-sm font-semibold text-theme-text-primary">
                          {selectedEmbedderObject.name}
                        </div>
                        <div className="mt-1 text-xs text-description">
                          {selectedEmbedderObject.description}
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
                {selectedEmbedderAvailable &&
                  selectedEmbedderObject.options(settings)}
              </div>

              {/* 文本分割设置 - 集成到嵌入器页面 */}
              <div className="mt-10">
                <TextSplitterSettings
                  settings={settings}
                  onChange={(newSettings) => {
                    setTextSplitterSettings(newSettings);
                    setHasChanges(true);
                  }}
                  showTitle={true}
                />
              </div>
            </div>
          </form>
        </div>
      )}
      <ModalWrapper isOpen={isOpen}>
        <ChangeWarningModal
          warningText="切换嵌入模型或文本分割设置将重置所有工作区中先前嵌入的文档。\n\n确认后将清除向量数据库中的所有嵌入,并从工作区中删除所有文档。您上传的文档不会被删除,它们将可用于重新嵌入。"
          onClose={closeModal}
          onConfirm={handleSaveSettings}
        />
      </ModalWrapper>
    </div>
  );
}
