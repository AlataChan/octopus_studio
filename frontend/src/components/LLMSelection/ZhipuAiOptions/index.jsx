import { useState, useEffect } from "react";
import System from "@/models/system";

export default function ZhipuAiOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.ZhipuAiApiKey);
  const [zhipuAiApiKey, setZhipuAiApiKey] = useState(settings?.ZhipuAiApiKey);

  return (
    <div className="flex gap-[36px] mt-1.5">
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          API Key
        </label>
        <input
          type="password"
          name="ZhipuAiApiKey"
          className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="智谱 AI API Key"
          defaultValue={settings?.ZhipuAiApiKey ? "*".repeat(20) : ""}
          required={true}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => setZhipuAiApiKey(inputValue)}
        />
      </div>
      {!settings?.credentialsOnly && (
        <ZhipuAiModelSelection settings={settings} apiKey={zhipuAiApiKey} />
      )}
    </div>
  );
}

function ZhipuAiModelSelection({ apiKey, settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findCustomModels() {
      if (!apiKey) {
        setModels([]);
        setLoading(true);
        return;
      }

      setLoading(true);
      const { models } = await System.customModels(
        "zhipu",
        typeof apiKey === "boolean" ? null : apiKey
      );
      setModels(models || []);
      setLoading(false);
    }
    findCustomModels();
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          Chat Model Selection
        </label>
        <select
          name="ZhipuAiModelPref"
          disabled={true}
          defaultValue=""
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
        >
          <option value="" disabled={true}>
            -- loading available models --
          </option>
        </select>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          Chat Model Selection
        </label>
        <select
          name="ZhipuAiModelPref"
          disabled={true}
          defaultValue=""
          className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
        >
          <option value="" disabled={true}>
            -- no models found --
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-theme-text-primary text-sm font-semibold block mb-3">
        Chat Model Selection
      </label>
      <select
        name="ZhipuAiModelPref"
        required={true}
        defaultValue={
          settings?.ZhipuAiModelPref &&
          models.some((m) => m.id === settings.ZhipuAiModelPref)
            ? settings.ZhipuAiModelPref
            : models[0]?.id
        }
        className="border-none bg-theme-settings-input-bg border-theme-border text-theme-text-primary text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
