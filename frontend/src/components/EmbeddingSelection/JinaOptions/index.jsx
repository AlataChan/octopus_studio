import React, { useState, useEffect } from "react";
import System from "@/models/system";
import PreLoader from "@/components/Preloader";
import { OLLAMA_COMMON_URLS } from "@/utils/constants";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import useProviderEndpointAutoDiscovery from "@/hooks/useProviderEndpointAutoDiscovery";

/**
 * Jina AI Embedding 配置组件
 * 支持两种部署模式:
 * 1. 本地部署 (通过 Ollama)
 * 2. API 调用 (通过 Jina AI API)
 */
export default function JinaOptions({ settings }) {
  const [deploymentMode, setDeploymentMode] = useState(
    settings?.JinaUseOllama === "true" ? "local" : "api"
  );

  return (
    <div className="w-full flex flex-col gap-y-4">
      {/* 部署模式选择 */}
      <div className="flex gap-x-4 mb-4">
        <button
          type="button"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            deploymentMode === "local"
              ? "bg-primary-button text-theme-text-primary"
              : "bg-theme-settings-input-bg text-white/60 hover:text-theme-text-primary"
          }`}
          onClick={() => setDeploymentMode("local")}
        >
          🏠 本地部署
        </button>
        <button
          type="button"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            deploymentMode === "api"
              ? "bg-primary-button text-theme-text-primary"
              : "bg-theme-settings-input-bg text-white/60 hover:text-theme-text-primary"
          }`}
          onClick={() => setDeploymentMode("api")}
        >
          ☁️ API 调用
        </button>
      </div>

      <input
        type="hidden"
        name="JinaUseOllama"
        value={deploymentMode === "local"}
      />

      {deploymentMode === "local" ? (
        <JinaLocalOptions settings={settings} />
      ) : (
        <JinaAPIOptions settings={settings} />
      )}
    </div>
  );
}

function JinaLocalOptions({ settings }) {
  const {
    autoDetecting: loading,
    basePath,
    basePathValue,
    showAdvancedControls,
    setShowAdvancedControls,
    handleAutoDetectClick,
  } = useProviderEndpointAutoDiscovery({
    provider: "ollama",
    initialBasePath: settings?.EmbeddingBasePath,
    ENDPOINTS: OLLAMA_COMMON_URLS,
  });

  const [maxChunkLength, setMaxChunkLength] = useState(
    settings?.EmbeddingModelMaxChunkLength || 8192
  );

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px]">
        <JinaModelSelection
          settings={settings}
          basePath={basePath.value}
          isLocal={true}
        />
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            最大文本块长度
          </label>
          <input
            type="number"
            name="EmbeddingModelMaxChunkLength"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="8192"
            min={1}
            value={maxChunkLength}
            onChange={(e) => setMaxChunkLength(Number(e.target.value))}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            Jina v2 模型支持最大 8192 tokens
          </p>
        </div>
      </div>

      <div className="flex justify-start mt-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setShowAdvancedControls(!showAdvancedControls);
          }}
          className="border-none text-theme-text-primary hover:text-theme-text-secondary flex items-center text-sm"
        >
          {showAdvancedControls ? "隐藏" : "显示"} Ollama 端点配置
          {showAdvancedControls ? (
            <CaretUp size={14} className="ml-1" />
          ) : (
            <CaretDown size={14} className="ml-1" />
          )}
        </button>
      </div>

      <div hidden={!showAdvancedControls}>
        <div className="flex flex-col w-60">
          <div className="flex justify-between items-center mb-2">
            <label className="text-theme-text-primary text-sm font-semibold">
              Ollama Base URL
            </label>
            {loading ? (
              <PreLoader size="6" />
            ) : (
              <>
                {!basePathValue.value && (
                  <button
                    type="button"
                    onClick={handleAutoDetectClick}
                    className="bg-primary-button text-xs font-medium px-2 py-1 rounded-lg hover:bg-secondary hover:text-theme-text-primary shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                  >
                    自动检测
                  </button>
                )}
              </>
            )}
          </div>
          <input
            type="url"
            name="EmbeddingBasePath"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="http://127.0.0.1:11434"
            value={basePathValue.value}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={basePath.onChange}
            onBlur={basePath.onBlur}
          />
        </div>
      </div>
    </div>
  );
}

function JinaAPIOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.JinaApiKey);
  const [apiKey, setApiKey] = useState(settings?.JinaApiKey);

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px]">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Jina AI API Key
          </label>
          <input
            type="password"
            name="JinaApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="输入 Jina AI API Key"
            defaultValue={settings?.JinaApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => setApiKey(inputValue)}
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            从 Jina AI 官网获取 API Key
          </p>
        </div>
        <JinaModelSelection
          settings={settings}
          apiKey={apiKey}
          isLocal={false}
        />
      </div>
    </div>
  );
}

function JinaModelSelection({
  settings,
  basePath = null,
  apiKey = null,
  isLocal,
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  const JINA_MODELS = [
    {
      id: "jina-embeddings-v2-base-zh",
      name: "Jina Embeddings v2 Base ZH (中文, 768维)",
    },
    {
      id: "jina-embeddings-v2-base-en",
      name: "Jina Embeddings v2 Base EN (英文, 768维)",
    },
    {
      id: "jina-embeddings-v2-small-en",
      name: "Jina Embeddings v2 Small EN (英文轻量, 512维)",
    },
  ];

  useEffect(() => {
    async function findModels() {
      if (isLocal) {
        if (!basePath) {
          setModels([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const { models } = await System.customModels(
            "ollama",
            null,
            basePath
          );
          setModels(models || []);
        } catch (error) {
          console.error("Failed to fetch Ollama models:", error);
          setModels([]);
        }
        setLoading(false);
      } else {
        setModels(JINA_MODELS);
        setLoading(false);
      }
    }
    findModels();
  }, [basePath, apiKey, isLocal]);

  if (loading || (isLocal && models.length === 0)) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          模型选择
        </label>
        <select
          name="EmbeddingModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            {isLocal
              ? basePath
                ? "--正在加载可用模型--"
                : "请先输入 Ollama URL"
              : "--正在加载--"}
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-theme-text-primary text-sm font-semibold block mb-3">
        模型选择
      </label>
      <select
        name="EmbeddingModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option
            key={model.id}
            value={model.id}
            selected={settings?.EmbeddingModelPref === model.id}
          >
            {model.name || model.id}
          </option>
        ))}
      </select>
      <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
        {isLocal
          ? "从 Ollama 中选择已下载的 Jina 模型"
          : "支持中英文的高质量 embedding 模型"}
      </p>
    </div>
  );
}
