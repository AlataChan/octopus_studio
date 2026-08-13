import { useState } from "react";

/**
 * Qwen (通义千问) Embedding 配置组件
 * 仅支持 API 调用模式
 */
export default function QwenOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.QwenApiKey);

  const QWEN_MODELS = [
    { id: "text-embedding-v1", name: "Text Embedding v1 (中文, 1536维)" },
    { id: "text-embedding-v2", name: "Text Embedding v2 (中文增强, 1536维)" },
    { id: "text-embedding-v3", name: "Text Embedding v3 (最新版本, 1536维)" },
  ];

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            通义千问 API Key
          </label>
          <input
            type="password"
            name="QwenApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="输入阿里云 DashScope API Key"
            defaultValue={settings?.QwenApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            从阿里云 DashScope 控制台获取 API Key
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
            {QWEN_MODELS.map((model) => (
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
            推荐使用 v2 或 v3 版本获得更好效果
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
            placeholder="2048"
            min={1}
            defaultValue={settings?.EmbeddingModelMaxChunkLength || 2048}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            Qwen 模型最大支持 2048 tokens
          </p>
        </div>
      </div>
    </div>
  );
}
