import React, { useState, useEffect } from "react";
import System from "@/models/system";
import PreLoader from "@/components/Preloader";
import { OLLAMA_COMMON_URLS } from "@/utils/constants";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import useProviderEndpointAutoDiscovery from "@/hooks/useProviderEndpointAutoDiscovery";

/**
 * BAAI (智源) Embedding 配置组件
 * 支持两种部署模式:
 * 1. 本地部署 (通过 Ollama) - 推荐
 * 2. API 调用 (通过 BAAI API)
 */
export default function BAAIOptions({ settings }) {
  const [deploymentMode, setDeploymentMode] = useState(
    settings?.BAAIUseOllama === "true" ? "local" : "api"
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
          🏠 本地部署 (推荐)
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

      {/* 隐藏字段: 记录部署模式 */}
      <input
        type="hidden"
        name="BAAIUseOllama"
        value={deploymentMode === "local"}
      />

      {deploymentMode === "local" ? (
        <BAAILocalOptions settings={settings} />
      ) : (
        <BAAIAPIOptions settings={settings} />
      )}
    </div>
  );
}

/**
 * 本地部署配置 (通过 Ollama)
 */
function BAAILocalOptions({ settings }) {
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
    settings?.EmbeddingModelMaxChunkLength || 512
  );

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px]">
        <BAAIModelSelection
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
            placeholder="512"
            min={1}
            value={maxChunkLength}
            onChange={(e) => setMaxChunkLength(Number(e.target.value))}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            BAAI 模型推荐使用 512
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

/**
 * API 调用配置
 */
function BAAIAPIOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.BAAIApiKey);
  const [apiKey, setApiKey] = useState(settings?.BAAIApiKey);

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px]">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            BAAI API Key
          </label>
          <input
            type="password"
            name="BAAIApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="输入 BAAI API Key"
            defaultValue={settings?.BAAIApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => setApiKey(inputValue)}
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            从 BAAI 官网获取 API Key
          </p>
        </div>
        <BAAIModelSelection
          settings={settings}
          apiKey={apiKey}
          isLocal={false}
        />
      </div>
    </div>
  );
}

/**
 * 模型选择组件
 */
function BAAIModelSelection({
  settings,
  basePath = null,
  apiKey = null,
  isLocal,
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  // 预定义的 BAAI 模型列表
  const BAAI_MODELS = [
    { id: "bge-large-zh-v1.5", name: "BGE Large ZH v1.5 (中文最佳, 1024维)" },
    { id: "bge-base-zh-v1.5", name: "BGE Base ZH v1.5 (中文, 768维)" },
    { id: "bge-small-zh-v1.5", name: "BGE Small ZH v1.5 (中文轻量, 512维)" },
    { id: "bge-large-en-v1.5", name: "BGE Large EN v1.5 (英文, 1024维)" },
  ];

  useEffect(() => {
    async function findModels() {
      if (isLocal) {
        // 本地模式: 从 Ollama 获取模型列表
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
        // API 模式: 使用预定义列表
        setModels(BAAI_MODELS);
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
          ? "从 Ollama 中选择已下载的 BAAI 模型"
          : "推荐使用 bge-large-zh-v1.5 获得最佳中文效果"}
      </p>
    </div>
  );
}
