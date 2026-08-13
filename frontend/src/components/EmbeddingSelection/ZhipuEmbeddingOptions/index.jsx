import { useState } from "react";

/**
 * Zhipu AI (智谱 AI) Embedding 配置组件
 * 仅支持 API 调用模式
 */
export default function ZhipuEmbeddingOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.ZhipuApiKey);

  const ZHIPU_MODELS = [
    { id: "embedding-2", name: "Embedding-2 (中文, 1024维)" },
    { id: "embedding-3", name: "Embedding-3 (最新版本, 2048维)" },
  ];

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            智谱 AI API Key
          </label>
          <input
            type="password"
            name="ZhipuApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="输入智谱 AI API Key"
            defaultValue={settings?.ZhipuApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            从智谱 AI 开放平台获取 API Key
          </p>
        </div>

        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            模型选择
          </label>
          <select
            name="EmbeddingModelPref"
            required={true}
            className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
          >
            {ZHIPU_MODELS.map((model) => (
              <option
                key={model.id}
                value={model.id}
                selected={settings?.EmbeddingModelPref === model.id}
              >
                {model.name}
              </option>
            ))}
          </select>
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            推荐使用 embedding-3 获得更好效果
          </p>
        </div>
      </div>

      <div className="w-full flex items-start gap-[36px] mt-2">
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
            defaultValue={settings?.EmbeddingModelMaxChunkLength || 512}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            智谱 AI 模型最大支持 512 tokens
          </p>
        </div>
      </div>
    </div>
  );
}
