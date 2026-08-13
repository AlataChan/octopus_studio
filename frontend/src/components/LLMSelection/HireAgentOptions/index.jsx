import { useState, useEffect } from "react";
import System from "@/models/system";

export default function HireAgentOptions({ settings }) {
  const [basePathValue, setBasePathValue] = useState(
    settings?.HireAgentBasePath
  );
  const [basePath, setBasePath] = useState(settings?.HireAgentBasePath);
  const [apiKeyValue, setApiKeyValue] = useState(settings?.HireAgentApiKey);
  const [apiKey, setApiKey] = useState(settings?.HireAgentApiKey);

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="flex gap-[36px] mt-1.5">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            Base URL
          </label>
          <input
            type="url"
            name="HireAgentBasePath"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="https://api.hireagent.ai/v1"
            defaultValue={settings?.HireAgentBasePath}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setBasePathValue(e.target.value)}
            onBlur={() => setBasePath(basePathValue)}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            API Key
          </label>
          <input
            type="password"
            name="HireAgentApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Octopus Studio API Key"
            defaultValue={settings?.HireAgentApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setApiKeyValue(e.target.value)}
            onBlur={() => setApiKey(apiKeyValue)}
          />
        </div>
        {!settings?.credentialsOnly && (
          <HireAgentModelSelection
            settings={settings}
            basePath={basePath}
            apiKey={apiKey}
          />
        )}
      </div>
    </div>
  );
}

function HireAgentModelSelection({ basePath, apiKey, settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [customModel, setCustomModel] = useState(
    settings?.HireAgentModelPref || ""
  );

  useEffect(() => {
    async function findCustomModels() {
      if (!basePath || !apiKey) {
        setModels([]);
        setLoading(true);
        return;
      }

      setLoading(true);
      const { models } = await System.customModels(
        "hireagent",
        apiKey,
        basePath
      );
      setModels(models || []);
      setLoading(false);
    }
    findCustomModels();
  }, [basePath, apiKey]);

  // 检查当前选中的模型是否在列表中
  const currentModelInList = models.some(
    (m) => m.id === settings?.HireAgentModelPref
  );

  return (
    <div className="flex flex-col w-60">
      <div className="flex items-center justify-between mb-3">
        <label className="text-theme-text-primary text-sm font-semibold">
          Chat Model Selection
        </label>
        <button
          type="button"
          onClick={() => setCustomModelMode(!customModelMode)}
          className="text-xs text-primary-button hover:text-primary-button/80 transition-colors"
        >
          {customModelMode ? "选择预设" : "自定义输入"}
        </button>
      </div>

      {loading ? (
        <select
          name="HireAgentModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
          defaultValue=""
        >
          <option disabled={true} value="">
            -- loading available models --
          </option>
        </select>
      ) : customModelMode ? (
        <input
          type="text"
          name="HireAgentModelPref"
          className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="输入模型名称，如: gpt-4o"
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          required={true}
          autoComplete="off"
        />
      ) : (
        <select
          name="HireAgentModelPref"
          required={true}
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
          defaultValue={
            currentModelInList ? settings?.HireAgentModelPref : models[0]?.id
          }
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
